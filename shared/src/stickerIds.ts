// The sticker ids the app can draw (drawings live in web/src/render/decor.tsx, which must have exactly these keys)
// with one plain word each, for the AI album prompt.
export const STICKERS: { id: string; word: string }[] = [
  ['flower', 'flower'], ['heart', 'heart'], ['star', 'star'], ['leaf', 'leaf'], ['sun', 'sun'], ['moon', 'moon'],
  ['camera', 'camera'], ['plane', 'paper plane'], ['ticket', 'ticket stub'], ['coffee', 'coffee cup'], ['cloud', 'cloud'],
  ['arrow', 'arrow doodle'], ['butterfly', 'butterfly'], ['strawberry', 'strawberry'], ['cherries', 'cherries'],
  ['rainbow', 'rainbow'], ['balloon', 'balloon'], ['gift', 'gift box'], ['cake', 'cake slice'], ['music', 'music notes'],
  ['bow', 'ribbon bow'], ['letter', 'love letter'], ['pin', 'map pin'], ['mountain', 'mountains'], ['icecream', 'ice cream'],
  ['clover', 'clover'], ['paw', 'paw print'], ['sparkle', 'sparkles'], ['octopus', 'octopus'], ['octopus-blue', 'little octopus'],
  ['squid', 'squid'], ['bubbles', 'bubbles'], ['seaweed', 'seaweed'], ['shell', 'seashell'], ['starfish', 'starfish'],
  ['fish', 'fish'], ['anchor', 'anchor'], ['infinity', 'infinity heart'], ['energy-can', 'energy drink'], ['onigiri', 'rice ball'],
  ['sushi', 'sushi'], ['ring', 'ring'], ['bubble', 'speech bubble'],
].map(([id, word]) => ({ id, word }))

export const STICKER_IDS: ReadonlySet<string> = new Set(STICKERS.map((s) => s.id))
