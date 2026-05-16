import { useState, useEffect } from 'react';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  increment,
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Room, Player, Track } from '../types';
import axios from 'axios';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function useGame(roomId: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
      if (snapshot.exists()) {
        setRoom({ id: snapshot.id, ...snapshot.data() } as Room);
      } else {
        setRoom(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Firestore Error:", err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsub();
  }, [roomId]);

  const createRoom = async (name: string, sourceId: string, isMulti: boolean = false) => {
    if (!auth.currentUser) return;
    
    try {
      // Fetch tracks
      const url = isMulti ? `/api/tracks-multi?terms=${encodeURIComponent(sourceId)}` : `/api/tracks-by-category/${sourceId}`;
      const res = await axios.get(url);
      const tracks: Track[] = res.data;

      const newRoom: Partial<Room> = {
        name,
        hostId: auth.currentUser.uid,
        status: 'waiting',
        playlistId: sourceId,
        currentRound: 0,
        currentPhase: 1,
        phaseStartTime: serverTimestamp(),
        currentTrackId: null,
        players: {
          [auth.currentUser.uid]: {
            uid: auth.currentUser.uid,
            displayName: auth.currentUser.displayName || 'Гравець',
            photoURL: auth.currentUser.photoURL || '',
            score: 0,
            lastAnswerCorrect: false,
            answerTime: null,
            joinedAt: Date.now()
          }
        },
        tracks
      };

      const roomRef = doc(db, 'rooms', Math.random().toString(36).substring(7));
      await setDoc(roomRef, newRoom);
      return roomRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'rooms');
    }
  };

  const joinRoom = async (id: string) => {
    if (!auth.currentUser) return;
    const roomRef = doc(db, 'rooms', id);
    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) throw new Error("Кімнату не знайдено");

      const player: Player = {
        uid: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || 'Гравець',
        photoURL: auth.currentUser.photoURL || '',
        score: 0,
        lastAnswerCorrect: false,
        answerTime: null,
        joinedAt: Date.now()
      };

      await updateDoc(roomRef, {
        [`players.${auth.currentUser.uid}`]: player
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${id}`);
    }
  };

  const startGame = async () => {
    if (!room || room.hostId !== auth.currentUser?.uid) return;
    if (!room.tracks || room.tracks.length === 0) {
      alert("Недостатньо треків для початку гри");
      return;
    }
    try {
      await axios.post(`/api/rooms/${room.id}/start`);
    } catch (err) {
      console.error("Failed to start game:", err);
      alert("Помилка при запуску гри. Перевірте консоль.");
    }
  };

  const submitAnswer = async (correct: boolean, reactionTime: number) => {
    if (!room || !auth.currentUser || room.status !== 'playing') return;
    
    try {
      const phaseWeights = [1000, 500, 250];
      const maxPhasePoints = phaseWeights[room.currentPhase - 1] || 250;
      
      // Snappy 1.5s answer window used for multiplier
      const multiplier = Math.max(0, (1500 - reactionTime) / 1500);
      const scoreGain = correct ? Math.floor(maxPhasePoints * multiplier) : 0;
      
      const roomRef = doc(db, 'rooms', room.id);
      
      const updates: Record<string, any> = {
        [`players.${auth.currentUser.uid}.score`]: increment(scoreGain),
        [`players.${auth.currentUser.uid}.lastAnswerCorrect`]: correct,
        [`players.${auth.currentUser.uid}.answerTime`]: reactionTime
      };

      if (correct) {
        // INSTANT WIN logic: Move to intermission immediately
        // The server is listening for this status change to cancel phase timers
        updates.status = 'intermission';
      }

      await updateDoc(roomRef, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  return { room, loading, error, createRoom, joinRoom, startGame, submitAnswer };
}
