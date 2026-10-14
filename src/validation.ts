// Input validation: parsing and checking user input (e.g. scores like "3-1") before it reaches the database.
// Step 2

export function isValidScore(format: string, myGames: number, theirGames: number): boolean {
    const winner = Math.max(myGames, theirGames); 
    const loser = Math.min(myGames, theirGames);


    switch (format) {
        case "bo1": return winner === 1 && loser < 1;
        case "bo3": return winner === 2 && loser < 2;
        case "bo5": return winner === 3 && loser < 3; 
        case "ft6": return (winner === 6 && loser <= 4) || (winner > 6 && winner - loser === 2);

        default: return false;
    };
}