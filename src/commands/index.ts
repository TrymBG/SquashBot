// The list of all slash commands. Add new commands here, and both the bot and the deploy script pick them up.
import * as leaderboard from "./leaderboard.js";
import * as ping from "./ping.js";
import * as result from "./result.js";
import * as undo from "./undo.js";

export const commands = [ping, result, leaderboard, undo];
