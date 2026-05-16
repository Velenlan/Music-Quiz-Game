import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

// Initialize Firebase Admin
let db: admin.firestore.Firestore;

try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  console.log(`[System] Reading Firebase config from: ${configPath}`);
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
    console.log("[System] Firebase Admin initialized.");
  }
  
  const app = admin.app();
  const dbId = firebaseConfig.firestoreDatabaseId;
  
  // Initialize with specific database ID
  if (dbId) {
    db = getFirestore(app, dbId);
    console.log(`[System] Firestore initialized for database: ${dbId}`);
  } else {
    db = getFirestore(app);
    console.log("[System] Firestore initialized for default database.");
  }
} catch (e) {
  console.error("[System] Firebase initialization critical failure:", e);
}

interface RoomLoop {
  roomId: string;
  phaseTimeout: NodeJS.Timeout | null;
  intermissionTimeout: NodeJS.Timeout | null;
  unsubscribe: () => void;
}

const activeRooms = new Map<string, RoomLoop>();
const roomClients = new Map<string, Set<WebSocket>>();

async function startServer() {
  console.log("[System] Starting server...");
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // Simple health check endpoint
  app.get("/_health", (req, res) => res.json({ 
    status: "alive", 
    dbReady: !!db,
    time: new Date().toISOString() 
  }));

  // --- iTunes API Routes (Don't need DB) ---
  const CATEGORY_CONFIGS = [
    { id: 'top-ua', name: 'Українські хіти', term: 'Ukraine Top Charts', country: 'ua' },
    { id: 'global', name: 'Світовий Топ', term: 'Top Hits 2024', country: 'us' },
    { id: 'rock', name: 'Рок Класика', term: 'Rock Classics', country: 'us' },
    { id: 'hiphop', name: 'Хіп-хоп', term: 'Hip-Hop Hits', country: 'us' },
    { id: 'edm', name: 'Електро', term: 'Dance Hits', country: 'us' },
    { id: 'jazz', name: 'Джаз', term: 'Jazz Essentials', country: 'us' },
  ];

  const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&h=600&fit=crop';

  app.get("/api/categories", async (req, res) => {
    try {
      const categoriesWithImages = await Promise.all(CATEGORY_CONFIGS.map(async (cat) => {
        try {
          const searchRes = await axios.get(`https://itunes.apple.com/search`, {
            params: { term: cat.term, country: cat.country, limit: 1, entity: 'song' }
          });
          const artwork = searchRes.data.results[0]?.artworkUrl100.replace('100x100', '600x600') || FALLBACK_IMAGE;
          return { id: cat.id, name: cat.name, imageUrl: artwork };
        } catch (e) {
          return { id: cat.id, name: cat.name, imageUrl: FALLBACK_IMAGE };
        }
      }));
      res.json(categoriesWithImages);
    } catch (error) {
      res.status(500).json({ error: "Failed to load categories" });
    }
  });

  app.get("/api/search", async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
      const response = await axios.get(`https://itunes.apple.com/search`, {
        params: {
          term: q,
          media: 'music',
          entity: 'musicArtist',
          limit: 10
        }
      });
      
      const results = response.data.results.map((artist: any) => ({
        id: artist.artistId.toString(),
        name: artist.artistName,
        type: 'artist',
        imageUrl: `https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop` // Placeholder for artists as iTunes doesn't return artist images easily
      }));
      
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/tracks-multi", async (req, res) => {
    const { terms } = req.query;
    if (!terms) return res.json([]);
    
    const termList = (terms as string).split(',');
    try {
      const allTracks = await Promise.all(termList.map(async (term) => {
        const response = await axios.get(`https://itunes.apple.com/search`, {
          params: { term, entity: 'song', limit: 30 }
        });
        return response.data.results;
      }));

      const flatTracks = allTracks.flat()
        .filter((track: any) => track.previewUrl);

      // Deduplicate by trackId
      const uniqueMap = new Map();
      flatTracks.forEach((t: any) => uniqueMap.set(t.trackId.toString(), t));
      
      const mappedTracks = Array.from(uniqueMap.values()).map((track: any) => ({
        id: track.trackId.toString(),
        title: track.trackName,
        artist: track.artistName,
        albumArt: track.artworkUrl100.replace('100x100', '600x600'),
        previewUrl: track.previewUrl,
      }));

      // Fallback if no music found
      if (mappedTracks.length === 0) {
        return res.json([
          {
            id: 'fallback-1',
            title: 'Ambient Dreams',
            artist: 'System Audio',
            albumArt: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&h=600&fit=crop',
            previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
          }
        ]);
      }

      const shuffle = <T>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      const shuffled = shuffle(mappedTracks).slice(0, 20); // 20 rounds max
      res.json(shuffled);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  app.get("/api/tracks-by-category/:categoryId", async (req, res) => {
    const { categoryId } = req.params;
    const categoryMap: Record<string, { term: string, country: string }> = {
      'top-ua': { term: 'Ukrainian Hits', country: 'ua' },
      'global': { term: 'Top Hits', country: 'us' },
      'rock': { term: 'Rock Hits', country: 'us' },
      'hiphop': { term: 'Hip Hop', country: 'us' },
      'edm': { term: 'Dance Hits', country: 'us' },
      'jazz': { term: 'Jazz', country: 'us' }
    };

    const config = categoryMap[categoryId] || { term: categoryId, country: 'us' };

    try {
      const response = await axios.get(
        `https://itunes.apple.com/search`, {
          params: {
            term: config.term,
            country: config.country,
            entity: 'song',
            limit: 50,
            media: 'music'
          }
        }
      );
      
      const shuffle = <T>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      const tracks = response.data.results
        .filter((track: any) => track.previewUrl)
        .map((track: any) => ({
          id: track.trackId.toString(),
          title: track.trackName,
          artist: track.artistName,
          albumArt: track.artworkUrl100.replace('100x100', '600x600'),
          previewUrl: track.previewUrl,
          year: track.releaseDate?.split("-")[0],
        }));

      res.json(shuffle(tracks).slice(0, 20));
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  // Database safety middleware (ONLY for routes below)
  app.use("/api", (req, res, next) => {
    if (!db) {
      console.error(`[System] API request ${req.path} failed: Database not initialized`);
      return res.status(503).json({ error: "Service unavailable: Database not ready" });
    }
    next();
  });

  // WebSocket handling
  wss.on('connection', (ws, req) => {
    let currentRoomId: string | null = null;

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'JOIN_ROOM') {
          currentRoomId = data.roomId;
          if (!roomClients.has(data.roomId)) {
            roomClients.set(data.roomId, new Set());
          }
          roomClients.get(data.roomId)!.add(ws);
        }
      } catch (e) {
        console.error("WS error:", e);
      }
    });

    ws.on('close', () => {
      if (currentRoomId && roomClients.has(currentRoomId)) {
        roomClients.get(currentRoomId)!.delete(ws);
      }
    });
  });

  function broadcastToRoom(roomId: string, data: any) {
    const clients = roomClients.get(roomId);
    if (clients) {
      const payload = JSON.stringify(data);
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    }
  }

  // --- Game Loop Logic ---

  async function updateRoomState(roomId: string, updates: Record<string, any>) {
    console.log(`[Room ${roomId}] Updating state:`, Object.keys(updates));
    try {
      await db.collection('rooms').doc(roomId).update(updates);
    } catch (error) {
      console.error(`[Room ${roomId}] Failed to update state:`, error);
    }
  }

  async function advanceRoom(roomId: string) {
    const loop = activeRooms.get(roomId);
    if (!loop) {
      console.log(`[Room ${roomId}] AdvanceRoom called but no active loop found.`);
      return;
    }

    console.log(`[Room ${roomId}] Advancing state from status: ${loop.roomId}`);

    if (loop.phaseTimeout) {
      clearTimeout(loop.phaseTimeout);
      loop.phaseTimeout = null;
    }
    if (loop.intermissionTimeout) {
      clearTimeout(loop.intermissionTimeout);
      loop.intermissionTimeout = null;
    }

    const roomRef = db.collection('rooms').doc(roomId);
    const snap = await roomRef.get();
    if (!snap.exists) {
      console.log(`[Room ${roomId}] Snap does not exist, stopping loop.`);
      stopRoomLoop(roomId);
      return;
    }
    const room = snap.data();
    if (!room) return;

    if (room.status === 'intermission') {
      const nextRoundIndex = room.currentRound + 1;
      
      if (!room.tracks || nextRoundIndex >= room.tracks.length) {
        console.log(`[Room ${roomId}] Game ended at round ${nextRoundIndex}.`);
        await updateRoomState(roomId, { status: 'ended' });
        stopRoomLoop(roomId);
        return;
      }

      const playersUpdate: Record<string, any> = {};
      Object.keys(room.players || {}).forEach(uid => {
        playersUpdate[`players.${uid}.lastAnswerCorrect`] = false;
        playersUpdate[`players.${uid}.answerTime`] = null;
      });

      console.log(`[Room ${roomId}] Moving to round ${nextRoundIndex + 1}`);
      await updateRoomState(roomId, {
        status: 'playing',
        currentRound: nextRoundIndex,
        currentPhase: 1,
        currentTrackId: room.tracks[nextRoundIndex]?.id || null,
        phaseStartTime: admin.firestore.FieldValue.serverTimestamp(),
        ...playersUpdate
      });

      schedulePhase(roomId, 1);
    } else if (room.status === 'playing') {
      if (room.currentPhase < 3) {
        const nextPhase = room.currentPhase + 1;
        console.log(`[Room ${roomId}] Moving to phase ${nextPhase}`);
        await updateRoomState(roomId, {
          currentPhase: nextPhase,
          phaseStartTime: admin.firestore.FieldValue.serverTimestamp(),
        });
        schedulePhase(roomId, nextPhase);
      } else {
        console.log(`[Room ${roomId}] Round failed, moving to intermission.`);
        await updateRoomState(roomId, { status: 'intermission' });
        scheduleIntermission(roomId);
      }
    }
  }

  function schedulePhase(roomId: string, phase: number) {
    const loop = activeRooms.get(roomId);
    if (!loop) return;

    if (loop.phaseTimeout) clearTimeout(loop.phaseTimeout);
    
    const phaseDurations = [1000, 2000, 4000];
    const totalPhaseTime = phaseDurations[phase - 1] + 1500;
    
    console.log(`[Room ${roomId}] Scheduling Phase ${phase} for ${totalPhaseTime}ms`);
    loop.phaseTimeout = setTimeout(() => {
      advanceRoom(roomId);
    }, totalPhaseTime);
  }

  function scheduleIntermission(roomId: string) {
    const loop = activeRooms.get(roomId);
    if (!loop) return;

    if (loop.intermissionTimeout) clearTimeout(loop.intermissionTimeout);

    console.log(`[Room ${roomId}] Scheduling Intermission for 5000ms`);
    loop.intermissionTimeout = setTimeout(() => {
      advanceRoom(roomId);
    }, 5000);
  }

  function stopRoomLoop(roomId: string) {
    const loop = activeRooms.get(roomId);
    if (loop) {
      if (loop.phaseTimeout) clearTimeout(loop.phaseTimeout);
      if (loop.intermissionTimeout) clearTimeout(loop.intermissionTimeout);
      loop.unsubscribe();
      activeRooms.delete(roomId);
      console.log(`[Room ${roomId}] Stopped loop.`);
    }
  }

  function startRoomLoop(roomId: string) {
    if (activeRooms.has(roomId)) {
      console.log(`[Room ${roomId}] Loop already active.`);
      return;
    }

    console.log(`[Room ${roomId}] Starting loop monitor...`);
    const unsubscribe = db.collection('rooms').doc(roomId).onSnapshot(async (snap) => {
      const room = snap.data();
      const loop = activeRooms.get(roomId);
      
      if (!room || !loop) {
        if (loop) stopRoomLoop(roomId);
        return;
      }

      if (room.status === 'intermission' && loop.phaseTimeout) {
        console.log(`[Room ${roomId}] Early intermission (correct guess).`);
        clearTimeout(loop.phaseTimeout);
        loop.phaseTimeout = null;
        scheduleIntermission(roomId);
      }

      if (room.status === 'ended') {
        stopRoomLoop(roomId);
      }
    }, (error) => {
      console.error(`[Room ${roomId}] Snapshot error:`, error);
      stopRoomLoop(roomId);
    });

    activeRooms.set(roomId, {
      roomId,
      phaseTimeout: null,
      intermissionTimeout: null,
      unsubscribe
    });
  }

  async function resumeActiveRooms() {
    console.log("[System] Scanning for active sessions to resume...");
    try {
      const snap = await db.collection('rooms').where('status', 'in', ['playing', 'intermission']).get();
      console.log(`[System] Found ${snap.size} active sessions.`);
      
      snap.forEach(doc => {
        const room = doc.data();
        console.log(`[System] Resuming loop for room: ${doc.id}`);
        startRoomLoop(doc.id);
        
        if (room.status === 'playing') {
          schedulePhase(doc.id, room.currentPhase);
        } else if (room.status === 'intermission') {
          scheduleIntermission(doc.id);
        }
      });
    } catch (error) {
      console.error("[System] Failed to resume active sessions:", error);
    }
  }

  app.post("/api/rooms/:roomId/start", async (req, res) => {
    const { roomId } = req.params;
    console.log(`[API] Start requested for room: ${roomId}`);

    try {
      const roomRef = db.collection("rooms").doc(roomId);
      const snap = await roomRef.get();
      if (!snap.exists) return res.status(404).json({ error: "Room not found" });
      
      const room = snap.data();
      if (!room) return res.status(404).json({ error: "Room data empty" });

      if (!room.tracks || room.tracks.length === 0) {
        console.error(`[Room ${roomId}] No tracks available!`);
        return res.status(400).json({ error: "No tracks available in this room" });
      }

      const playersUpdate: Record<string, any> = {};
      Object.keys(room.players || {}).forEach(uid => {
        playersUpdate[`players.${uid}.lastAnswerCorrect`] = false;
        playersUpdate[`players.${uid}.answerTime`] = null;
        playersUpdate[`players.${uid}.score`] = 0;
      });

      await roomRef.update({
        status: 'playing',
        currentRound: 0,
        currentPhase: 1,
        currentTrackId: room.tracks[0]?.id || null,
        phaseStartTime: admin.firestore.FieldValue.serverTimestamp(),
        ...playersUpdate
      });

      startRoomLoop(roomId);
      schedulePhase(roomId, 1);
      
      res.json({ success: true });
    } catch (error) {
      console.error(`[API] Start Error for ${roomId}:`, error);
      res.status(500).json({ error: "Failed to start room" });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start server FIRST so the app shows up in the preview
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Verify Firestore connection and resume rooms in background
    (async () => {
      try {
        const testSnap = await db.collection('_health').limit(1).get();
        console.log("[System] Firestore connection verified.");
        await resumeActiveRooms();
      } catch (e) {
        console.error("[System] Firestore connection check failed or timed out:", e);
      }
    })();
  });
}

process.on('uncaughtException', (err) => {
  console.error('[System] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[System] Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer().catch(err => {
  console.error("[System] Failed to start server:", err);
});
