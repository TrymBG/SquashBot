// Business logic for reading data: getLeaderboard, getPlayerStats, getHeadToHead.
import { getLeaderboard as queryLeaderboard, type LeaderboardRow } from "../db.js";

const LEADERBOARD_SIZE = 20;

export function getLeaderboard(): LeaderboardRow[] {
  return queryLeaderboard(LEADERBOARD_SIZE);
}
