import { PlayMovieCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles playing video/movie commands
 * Displays full-screen video and waits for completion
 */
export function handlePlayMovie(
  command: PlayMovieCommand,
  context: CommandContext,
  assetResolver: (assetId: string, type: 'image' | 'audio' | 'video') => string | null
): CommandResult {
  const movieUrl = assetResolver(command.videoId, 'video');

  return {
    advance: false,
    updates: {
      uiState: {
        ...context.playerState.uiState,
        isWaitingForInput: true,
        movieUrl: movieUrl,
      },
    },
  };
}
