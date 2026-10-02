const GENRE_NAMES: Record<string, string> = {
  Action: 'Ação',
  Adventure: 'Aventura',
  Animation: 'Animação',
  Biography: 'Biografia',
  Comedy: 'Comédia',
  Crime: 'Crime',
  Documentary: 'Documentário',
  Drama: 'Drama',
  Family: 'Família',
  Fantasy: 'Fantasia',
  History: 'História',
  Horror: 'Terror',
  Mystery: 'Mistério',
  Romance: 'Romance',
  'Sci-Fi': 'Ficção científica',
  Sport: 'Esporte',
  Thriller: 'Suspense',
  War: 'Guerra',
  Western: 'Faroeste',
  'Reality-TV': 'Reality show',
  'Talk-Show': 'Talk show',
  'Game-Show': 'Game show',
  Music: 'Música',
  Musical: 'Musical',
  'Film-Noir': 'Noir',
  News: 'Notícias',
  Short: 'Curta-metragem'
};

/** The pt-BR name of a Cinemeta genre, or the genre itself when unknown. */
export function genreName(genre: string): string {
  return GENRE_NAMES[genre] ?? genre;
}
