//! Ties the rqbit sidecar's lifetime to the app process, so a force-quit, a
//! crash or a killed E2E driver does not leave the engine running.
//!
//! - Linux: the child asks the kernel for SIGTERM when its parent dies.
//! - Windows: the child joins a kill-on-close Job Object owned by the app.
//! - macOS has no equivalent; `cleanup_stale_engine` removes a leftover
//!   engine on the next launch.

use std::io;
use std::process::{Child, Command};

/// Spawns `command` so the process stops when the app exits for any reason.
///
/// On Linux the signal is tied to the *thread* that spawns the child, so call
/// this from a thread that lives as long as the app (a Tokio worker thread,
/// never a `spawn_blocking` thread, which exits when idle).
pub fn spawn_tied_to_app(command: &mut Command) -> io::Result<Child> {
    #[cfg(target_os = "linux")]
    linux::stop_when_parent_dies(command);

    let child = command.spawn()?;

    #[cfg(windows)]
    if let Err(error) = windows::stop_with_app(&child) {
        eprintln!("Failed to tie the engine to the app's lifetime: {error}");
    }

    Ok(child)
}

#[cfg(target_os = "linux")]
mod linux {
    use std::io;
    use std::os::unix::process::CommandExt;
    use std::process::Command;

    pub fn stop_when_parent_dies(command: &mut Command) {
        let parent = std::process::id() as libc::pid_t;
        // SAFETY: the hook runs in the forked child before exec and only calls
        // async-signal-safe functions; it does not allocate.
        unsafe {
            command.pre_exec(move || {
                if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) == -1 {
                    return Err(io::Error::last_os_error());
                }
                // The app may have died between fork and prctl.
                if libc::getppid() != parent {
                    return Err(io::Error::from_raw_os_error(libc::ESRCH));
                }
                Ok(())
            });
        }
    }
}

#[cfg(windows)]
mod windows {
    use std::io;
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::sync::OnceLock;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    pub fn stop_with_app(child: &Child) -> io::Result<()> {
        let job = app_job()?;
        // SAFETY: both handles are valid; the child handle is owned by `child`.
        if unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    /// The app's job, created once. Its handle is never closed: Windows closes
    /// it when the app exits, however that happens, and kills every process in
    /// the job. Created without security attributes, so it is not inherited
    /// and the engine cannot keep it alive.
    fn app_job() -> io::Result<HANDLE> {
        static APP_JOB: OnceLock<usize> = OnceLock::new();
        if let Some(job) = APP_JOB.get() {
            return Ok(*job as HANDLE);
        }

        // SAFETY: plain Win32 calls with valid arguments; `info` outlives them.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(io::Error::last_os_error());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if configured == 0 {
                let error = io::Error::last_os_error();
                CloseHandle(job);
                return Err(error);
            }
            let stored = *APP_JOB.get_or_init(|| job as usize);
            if stored != job as usize {
                CloseHandle(job);
            }
            Ok(stored as HANDLE)
        }
    }
}

#[cfg(all(test, any(target_os = "linux", windows)))]
mod tests {
    use super::spawn_tied_to_app;
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    const ROLE_ENV: &str = "GRID_ENGINE_PROCESS_TEST_ROLE";
    const STAND_IN_LIFETIME: Duration = Duration::from_secs(120);

    /// Runs one ignored test of this binary in a new process, in `role`.
    fn test_binary(test: &str, role: &str) -> Command {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args(["--exact", test, "--ignored", "--nocapture"])
            .env(ROLE_ENV, role);
        command
    }

    fn has_role(role: &str) -> bool {
        std::env::var(ROLE_ENV).as_deref() == Ok(role)
    }

    fn process_is_running(pid: u32) -> bool {
        let pid = sysinfo::Pid::from_u32(pid);
        let mut sys = sysinfo::System::new();
        sys.refresh_processes_specifics(
            sysinfo::ProcessesToUpdate::Some(&[pid]),
            true,
            sysinfo::ProcessRefreshKind::nothing(),
        );
        sys.process(pid)
            .is_some_and(|process| process.status() != sysinfo::ProcessStatus::Zombie)
    }

    /// Stands in for the app: starts the engine stand-in and waits to be killed.
    #[test]
    #[ignore = "helper process for the_engine_stops_when_the_app_is_killed"]
    fn app_stand_in() {
        if !has_role("app") {
            return;
        }
        let mut engine = test_binary("engine_process::tests::engine_stand_in", "engine");
        engine.stdout(Stdio::null());
        let mut child = spawn_tied_to_app(&mut engine).expect("engine stand-in starts");
        println!("ENGINE_PID={}", child.id());
        let _ = child.wait();
    }

    #[test]
    #[ignore = "helper process for the_engine_stops_when_the_app_is_killed"]
    fn engine_stand_in() {
        if has_role("engine") {
            std::thread::sleep(STAND_IN_LIFETIME);
        }
    }

    #[test]
    fn the_engine_stops_when_the_app_is_killed() {
        let mut app = test_binary("engine_process::tests::app_stand_in", "app")
            .stdout(Stdio::piped())
            .spawn()
            .expect("app stand-in starts");
        let engine_pid: u32 = BufReader::new(app.stdout.take().unwrap())
            .lines()
            .map_while(Result::ok)
            .find_map(|line| line.strip_prefix("ENGINE_PID=")?.parse().ok())
            .expect("the app stand-in reports the engine PID");
        assert!(
            process_is_running(engine_pid),
            "engine stand-in should be running"
        );

        app.kill().unwrap();
        app.wait().unwrap();

        let deadline = Instant::now() + Duration::from_secs(10);
        while process_is_running(engine_pid) {
            assert!(
                Instant::now() < deadline,
                "the engine (PID {engine_pid}) kept running after the app was killed"
            );
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}
