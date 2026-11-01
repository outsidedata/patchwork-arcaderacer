# playtester

A seat that plays itself: a bot on the page. Every frame a think reads the rows this seat sees and
names a press or nothing, and the press goes through the player plugin exactly as a key would.

## Why use it

Use playtester to prove a game works without a human at the keys: a bot that walks to the goal, a
seat that fires at the nearest enemy, a soak test of many seats, a demo or attract mode, an AI
opponent driven from the page. Because its presses go through `plugins.player` as messages up the
wire, the server, prediction and every rule see a bot's press exactly as they see a player's.

## How it works

playtester has a browser half only, no row, no numbers. An actor's setup calls
`plugins.playtester.play(player, think)`: `player` is the object whose functions send the seat's
messages (`plugins.player`), and `think(rows)` returns `[action, ...args]` or undefined. Each frame,
in its `tick`, it calls `think` with the rows this seat was sent and, if it named a press, calls
`player[action](...args)`. There is one playtester per client, so the think is this scene's.

## Using it

```ts
// in the seat's player.client.ts setup, or a dev.html testbed
plugins.playtester.play(plugins.player, rows => {
  const me = rows.find(r => r.kind === 'player' && r.data.mine)
  const coin = rows.find(r => r.kind === 'coin')
  if (!me || !coin) return undefined
  return ['move', Math.sign(coin.data.pos[0] - me.data.pos[0]), 0]
})
```

List `playtester` in the scene's `plugins` beside `player`.

## Plugins it works with

- **player**: the presses a think names are the player plugin's messages.

## Keywords

bot, AI player, autoplay, playtest, self-playing, automated testing, soak test, load test, demo
mode, attract mode, think, simulated input, headless play, `play`, `Think`
