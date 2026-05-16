export interface User {
  uid: string;
  displayName: string;
  photoURL: string;
}

export interface Player extends User {
  score: number;
  lastAnswerCorrect: boolean;
  answerTime: number | null;
  joinedAt: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  previewUrl: string;
  year?: string;
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  status: 'waiting' | 'starting' | 'playing' | 'intermission' | 'ended';
  playlistId: string;
  currentRound: number;
  currentPhase: number;
  phaseStartTime: any; // Firestore Timestamp
  currentTrackId: string | null;
  players: Record<string, Player>;
  tracks: Track[];
}

export interface Category {
  id: string;
  name: string;
  imageUrl: string;
}
