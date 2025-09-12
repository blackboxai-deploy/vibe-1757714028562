'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { GameBoard } from '@/components/game/GameBoard';
import { PlayerPanel } from '@/components/game/PlayerPanel';
import { DiceComponent } from '@/components/game/DiceComponent';
import { GameStatus } from '@/components/game/GameStatus';
import { GameState, Player, SocketMessage } from '@/types/game';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { io, Socket } from 'socket.io-client';

export default function GameRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [roomCode, setRoomCode] = useState<string>('');

  // Initialize socket connection and load game state
  useEffect(() => {
    if (!roomId) return;

    // Get player info from localStorage
    const playerData = localStorage.getItem('ludoPlayer');
    if (!playerData) {
      router.push('/');
      return;
    }

    const player = JSON.parse(playerData);
    setCurrentPlayer(player);

    // Initialize socket connection  
    const socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      forceNew: true
    });

    setSocket(socketInstance);

    // Socket event handlers
    socketInstance.on('connect', () => {
      setIsConnected(true);
      setConnectionError('');
      console.log('Connected to server');
      
      // Join the game room
      socketInstance.emit('join-room', { roomId, player });
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    socketInstance.on('connect_error', (error) => {
      console.log('WebSocket connection failed, using polling fallback');
      setIsConnected(false);
      // Don't set as error, just use polling
    });

    socketInstance.on('game-state', (data: SocketMessage) => {
      if (data.type === 'GAME_STATE_UPDATE') {
        setGameState(data.payload);
        setIsLoading(false);
      }
    });

    socketInstance.on('error', (data: SocketMessage) => {
      if (data.type === 'ERROR') {
        setConnectionError(data.payload.message);
      }
    });

    // Load initial game state immediately  
    loadGameState();

    // Set up polling interval for real-time updates
    const pollingInterval = setInterval(() => {
      loadGameState();
    }, 3000); // Poll every 3 seconds for game updates

    // Cleanup polling
    const originalCleanup = () => {
      socketInstance.disconnect();
      clearInterval(pollingInterval);
    };

    // Cleanup on unmount
    return originalCleanup;
  }, [roomId, router]);

  const loadGameState = async () => {
    try {
      // First get room info to get the actual 6-digit code
      const roomResponse = await fetch(`/api/rooms/${roomId}`);
      const roomData = await roomResponse.json();
      
      if (roomData.success && roomData.room) {
        setRoomCode(roomData.room.code);
      }

      // Then get game state
      const response = await fetch(`/api/game/${roomId}/state`);
      const data = await response.json();
      
      if (data.success && data.gameState) {
        setGameState(data.gameState);
        setConnectionError(''); // Clear any previous errors
        setIsLoading(false);
      } else {
        setConnectionError(data.error || 'Failed to load game');
        setIsLoading(false);
      }
    } catch (error) {
      setConnectionError('Failed to connect to game');
      console.error('Load game state error:', error);
      setIsLoading(false);
    }
  };

  const rollDice = async () => {
    if (!currentPlayer || !gameState || !gameState.canRollDice) return;

    try {
      const response = await fetch(`/api/game/${roomId}/roll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerId: currentPlayer.id }),
      });

      const data = await response.json();
      if (data.success) {
        // Game state will be updated via socket
      } else {
        console.error('Roll dice error:', data.error);
      }
    } catch (error) {
      console.error('Roll dice network error:', error);
    }
  };

  const moveToken = async (tokenId: string, newPosition: number) => {
    if (!currentPlayer || !gameState) return;

    try {
      const response = await fetch(`/api/game/${roomId}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          playerId: currentPlayer.id, 
          tokenId, 
          newPosition 
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Game state will be updated via socket
      } else {
        console.error('Move token error:', data.error);
      }
    } catch (error) {
      console.error('Move token network error:', error);
    }
  };

  const leaveRoom = () => {
    if (socket) {
      socket.emit('leave-room', { roomId, playerId: currentPlayer?.id });
      socket.disconnect();
    }
    localStorage.removeItem('ludoPlayer');
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <motion.div 
          className="text-center space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-lg text-gray-600">Loading game...</p>
        </motion.div>
      </div>
    );
  }

  if (connectionError && !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <motion.div 
          className="text-center space-y-4 bg-white p-8 rounded-lg shadow-lg"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="text-6xl">⚠️</div>
          <h2 className="text-2xl font-bold text-red-600">Connection Error</h2>
          <p className="text-gray-600">{connectionError}</p>
          <div className="space-y-2">
            <Button onClick={loadGameState} variant="outline">
              Try Again
            </Button>
            <Button onClick={leaveRoom} variant="ghost">
              Back to Home
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Show waiting screen if game is in waiting state
  if (gameState?.gameStatus === 'waiting') {
    const playersNeeded = 2 - gameState.players.length;
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
        <div className="max-w-4xl mx-auto">
          
          {/* Header */}
          <motion.div 
            className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white/80 backdrop-blur-sm rounded-lg p-4 shadow-lg"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-4 mb-4 md:mb-0">
              <h1 className="text-2xl font-bold text-gray-800">Ludo Game</h1>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="text-sm text-gray-600">Waiting for Players</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                 Room: <span className="font-mono font-bold text-lg">{roomCode || 'Loading...'}</span>
              </div>
              <Button onClick={leaveRoom} variant="outline" size="sm">
                Leave Game
              </Button>
            </div>
          </motion.div>

          {/* Waiting Screen */}
          <div className="flex items-center justify-center min-h-[60vh]">
            <motion.div 
              className="text-center space-y-6 bg-white/90 backdrop-blur-sm rounded-xl p-8 shadow-2xl max-w-md w-full"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <motion.div
                className="text-8xl mb-4"
                animate={{
                  rotate: [0, 10, -10, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                ⏳
              </motion.div>
              
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-800">Waiting for Player</h2>
                <p className="text-gray-600">
                  Share this room code with a friend to start playing!
                </p>
                
                {/* Room Code Display */}
                <div className="bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg p-4 border-2 border-blue-200">
                  <div className="text-sm text-gray-600 mb-1">Room Code</div>
                   <div className="text-3xl font-bold font-mono text-blue-800 tracking-wider">
                    {roomCode || 'Loading...'}
                  </div>
                </div>
                
                {/* Current Players */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-700">Players ({gameState.players.length}/2)</h3>
                  {gameState.players.map((player, index) => (
                    <motion.div
                      key={player.id}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        player.color === 'red' ? 'bg-red-100' : 'bg-blue-100'
                      }`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <div className={`w-8 h-8 rounded-full ${
                        player.color === 'red' ? 'bg-red-500' : 'bg-blue-500'
                      } flex items-center justify-center text-white font-bold`}>
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800">{player.name}</span>
                      {currentPlayer?.id === player.id && (
                        <Badge variant="outline" className="ml-auto">You</Badge>
                      )}
                    </motion.div>
                  ))}
                  
                  {/* Empty slot */}
                  {playersNeeded > 0 && (
                    <motion.div
                      className="flex items-center gap-3 p-3 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold">
                        ?
                      </div>
                      <span className="text-gray-500 font-medium">Waiting for player...</span>
                    </motion.div>
                  )}
                </div>
                
                {/* Instructions */}
                <div className="text-sm text-gray-500 space-y-2 pt-4">
                  <p>🎯 Share the room code above with a friend</p>
                  <p>🚀 Game will start automatically when they join</p>
                  <p>🎲 Classic Ludo rules with 4 tokens per player</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <motion.div 
          className="text-center space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="text-6xl">🎲</div>
          <p className="text-lg text-gray-600">Setting up game...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <motion.div 
          className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white/80 backdrop-blur-sm rounded-lg p-4 shadow-lg"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <h1 className="text-2xl font-bold text-gray-800">Ludo Game</h1>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
               Room: <span className="font-mono font-bold">{roomCode || 'Loading...'}</span>
            </div>
            <Button onClick={leaveRoom} variant="outline" size="sm">
              Leave Game
            </Button>
          </div>
        </motion.div>

        {/* Game Status */}
        <GameStatus 
          gameState={gameState} 
          currentPlayer={currentPlayer}
          connectionError={connectionError}
        />

        {/* Main Game Area */}
        <div className="grid lg:grid-cols-4 gap-6">
          
          {/* Player Panels */}
          <motion.div 
            className="lg:col-span-1 space-y-4"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            {gameState.players.map((player, index) => (
              <PlayerPanel 
                key={player.id} 
                player={player} 
                isCurrentPlayer={currentPlayer?.id === player.id}
                isCurrentTurn={gameState.currentPlayerIndex === index}
              />
            ))}
          </motion.div>

          {/* Game Board */}
          <motion.div 
            className="lg:col-span-2"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <GameBoard 
              gameState={gameState}
              currentPlayer={currentPlayer}
              onTokenMove={moveToken}
            />
          </motion.div>

          {/* Game Controls */}
          <motion.div 
            className="lg:col-span-1 space-y-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <DiceComponent 
              dice={gameState.dice}
              canRoll={gameState.canRollDice && currentPlayer?.id === gameState.players[gameState.currentPlayerIndex]?.id}
              onRoll={rollDice}
            />
            
            {/* Game Info */}
            <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 shadow-lg">
              <h3 className="font-semibold text-gray-800 mb-3">Game Info</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div>Players: {gameState.players.length}/2</div>
                <div>Status: {gameState.gameStatus}</div>
                <div>Turn: {gameState.players[gameState.currentPlayerIndex]?.name || 'Waiting...'}</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}