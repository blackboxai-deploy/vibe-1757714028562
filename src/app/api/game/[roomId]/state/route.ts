import { NextRequest, NextResponse } from 'next/server';
import { GameStateManager } from '@/lib/gameStateManager';
import { RoomManager } from '@/lib/roomUtils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;

    if (!roomId) {
      return NextResponse.json({
        success: false,
        error: 'Room ID is required'
      }, { status: 400 });
    }

    // Check if room exists
    const room = RoomManager.getRoomById(roomId);
    if (!room) {
      return NextResponse.json({
        success: false,
        error: 'Room not found'
      }, { status: 404 });
    }

    // Get or initialize game state
    let gameState = GameStateManager.getGameState(roomId);
    
    if (!gameState) {
      if (room.players.length === 2) {
        gameState = GameStateManager.initializeGameState(roomId);
      } else {
        // Room exists but needs more players - return waiting state
        const waitingGameState = {
          roomId: roomId,
          players: room.players.map(player => ({
            ...player,
            tokens: []
          })),
          currentPlayerIndex: 0,
          dice: { value: 0, playerId: '', timestamp: Date.now(), isRolling: false },
          gameStatus: 'waiting' as const,
          winner: null,
          moveHistory: [],
          canRollDice: false,
          canMoveToken: false,
          validMoves: []
        };
        
        return NextResponse.json({
          success: true,
          gameState: waitingGameState
        });
      }
    }

    if (!gameState) {
      return NextResponse.json({
        success: false,
        error: 'Failed to initialize game state'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      gameState
    });

  } catch (error) {
    console.error('Get game state error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}