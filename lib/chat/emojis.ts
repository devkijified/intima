/**
 * The emoji pack, laid out the way WhatsApp lays it out: the same
 * categories in the same order, the same reaction shortlist, recent
 * first. The glyphs are the standard Unicode emoji characters, so
 * they render in the phone's own emoji font, which is exactly the
 * artwork the user sees inside WhatsApp on that device. Entries are
 * full grapheme strings (never split a string into code points:
 * flags and ZWJ sequences would break).
 */

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export interface EmojiCategory {
  id: string
  label: string
  glyphs: string[]
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Smileys and emotion',
    glyphs: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
      '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐',
      '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
      '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
      '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🫠', '🫡', '🤥', '😶‍🌫️', '🥸', '🫥', '🫤', '🙂‍↔️', '🙂‍↕️',
      '💋', '💌', '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤',
      '🤍', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '💭', '💤',
    ],
  },
  {
    id: 'people',
    label: 'People and body',
    glyphs: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎',
      '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻',
      '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓',
      '👴', '👵', '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷', '👮', '🕵️', '💂', '🥷', '👷', '🤴', '👸', '👳',
      '👲', '🧕', '🤵', '👰', '🤰', '🤱', '🫄', '🫅', '👼', '🎅', '🤶', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟',
      '💆', '💇', '🚶', '🧍', '🧎', '🏃', '💃', '🕺', '🕴️', '👯', '🧖', '🧗', '🤺', '🏇', '⛷️', '🏂', '🏌️', '🏄', '🚣', '🚴',
      '🤽', '🧘', '🛀', '🛌', '👭', '👫', '👬', '💏', '💑', '👪', '🗣️', '👤', '👥', '🫂', '👣', '🫃',
    ],
  },
  {
    id: 'animals',
    label: 'Animals and nature',
    glyphs: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🦝', '🐻', '🐼', '🦩', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉',
      '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦢', '🦉', '🦩', '🦚', '🦜', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱',
      '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪲', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞',
      '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🦭', '🐊', '🐅', '🐆', '🦓', '🦏', '🦛', '🐘', '🦒', '🦘', '🐃', '🐂',
      '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🕊️', '🐇', '🦝',
      '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔', '🐾', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🪵', '🌱', '🌿',
      '☘️', '🍀', '🎍', '🪴', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🪨', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻',
      '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐', '🌟',
      '✨', '⚡', '☄️', '💥', '🔥', '🌪️', '🌈', '☀️', '🌤️', '⛅', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '💧', '💦', '🌊',
    ],
  },
  {
    id: 'food',
    label: 'Food and drink',
    glyphs: [
      '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🫐', '🥝', '🍅', '🫒', '🥥', '🥑',
      '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🫘', '🌰', '🍞', '🥐', '🥖', '🫓', '🥨',
      '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥚', '🍳',
      '🥘', '🍲', '🫕', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤',
      '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯',
      '🍼', '🥛', '☕', '🫖', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🫗', '🥤', '🧋', '🧃', '🧉', '🧊',
      '🥢', '🍽️', '🍴', '🥄', '🔪', '🫙', '🏺',
    ],
  },
  {
    id: 'activities',
    label: 'Activities',
    glyphs: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
      '🪁', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤾',
      '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️',
      '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲', '♟️',
      '🎯', '🎳', '🎮', '🎰', '🧩', '🪄', '🎩', '🎈', '🎉', '🎊', '🎎', '🎏', '🎐', '🎆', '🎇', '🧨', '✨', '🎂', '🎄', '🎃',
    ],
  },
  {
    id: 'travel',
    label: 'Travel and places',
    glyphs: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵',
      '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🛞', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆',
      '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓',
      '🪝', '⛽', '🚧', '🚦', '🚥', '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️',
      '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🛖', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦',
      '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩️', '🛤️', '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄', '🌠',
      '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁',
    ],
  },
  {
    id: 'objects',
    label: 'Objects',
    glyphs: [
      '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥',
      '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋',
      '🪫', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '🪪', '💎', '⚖️', '🪜',
      '🧰', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪓', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️',
      '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸',
      '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴',
      '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞', '🪟', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄',
      '🪅', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷️', '🪧', '📪', '📫', '📬',
      '📭', '📮', '🗳️', '✏️', '✒️', '🖋️', '🖊️', '🖌️', '🖍️', '📝', '✂️', '📁', '📂', '🗂️', '🗒️', '🗓️', '📆', '📅', '🗑️', '🔒',
      '🔓', '🔏', '🔐', '🔑', '🔨', '🪓', '⛏️', '⚒️', '🛠️', '🗡️', '⚔️', '🔫', '🪃', '🏹', '🎣', '🥊', '🥋', '🎽', '🛹', '🛼',
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    glyphs: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
      '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐',
      '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️',
      '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️',
      '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️',
      '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️',
      '🛃', '🛄', '🛅', '🛜', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙',
      '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️',
      '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️',
      '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '©️', '®️',
      '™️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪',
      '🟤', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '◼️', '◻️', '◾', '◽', '▪️', '▫️', '🔺', '🔻', '🔶', '🔷', '🔸', '🔹',
    ],
  },
  {
    id: 'flags',
    label: 'Flags',
    glyphs: [
      '🇳🇬', '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇬🇭', '🇺🇸', '🇬🇧', '🇨🇦', '🇿🇦', '🇰🇪', '🇨🇲', '🇸🇳', '🇨🇮', '🇹🇬', '🇧🇯',
      '🇫🇷', '🇩🇪', '🇮🇹', '🇪🇸', '🇵🇹', '🇳🇱', '🇧🇪', '🇨🇭', '🇦🇹', '🇮🇪', '🇸🇪', '🇳🇴', '🇩🇰', '🇫🇮', '🇵🇱', '🇺🇦', '🇹🇷', '🇸🇦', '🇦🇪', '🇶🇦',
      '🇮🇳', '🇵🇰', '🇧🇩', '🇨🇳', '🇯🇵', '🇰🇷', '🇮🇩', '🇲🇾', '🇸🇬', '🇹🇭', '🇻🇳', '🇵🇭', '🇦🇺', '🇳🇿', '🇧🇷', '🇦🇷', '🇲🇽', '🇨🇴', '🇵🇪', '🇨🇱',
      '🇪🇬', '🇲🇦', '🇩🇿', '🇹🇳', '🇱🇾', '🇪🇹', '🇹🇿', '🇺🇬', '🇦🇴', '🇿🇲', '🇿🇼', '🇲🇿', '🇧🇼', '🇳🇦', '🇲🇱', '🇧🇫', '🇳🇪', '🇹🇩', '🇸🇩', '🇸🇸',
    ],
  },
]

/** Search keywords for the glyphs people actually search for. */
const KEYWORDS: Record<string, string> = {
  '😂': 'laugh cry joy tears funny', '🤣': 'rofl laughing rolling', '😍': 'love heart eyes adore', '🥰': 'love smile hearts', '😘': 'kiss blow love', '😎': 'cool sunglasses', '🤔': 'thinking hmm', '😭': 'cry sob tears sad', '😢': 'cry sad tear', '😡': 'angry mad rage', '🤬': 'swearing angry curse', '😱': 'scream fear shock', '🥺': 'pleading puppy eyes please', '😴': 'sleep tired', '🤤': 'drool yummy', '😋': 'yummy tasty food', '🤑': 'money rich dollar', '🤗': 'hug happy', '🙄': 'eye roll whatever', '😏': 'smirk', '🥳': 'party celebrate birthday', '🤯': 'mind blown shock', '😈': 'devil evil', '👻': 'ghost halloween', '💀': 'skull dead', '💩': 'poop', '🤡': 'clown', '👍': 'thumbs up like yes approve', '👎': 'thumbs down dislike no', '🙏': 'pray please thanks hands amen', '💪': 'muscle strong flex gym', '👏': 'clap applause bravo', '🙌': 'raise hands celebrate praise', '🤝': 'handshake deal agree', '👀': 'eyes look see', '🔥': 'fire hot lit', '💯': 'hundred perfect score', '✨': 'sparkle magic new', '⚡': 'lightning bolt energy', '💥': 'boom explosion', '💦': 'sweat drops water', '💤': 'sleep zzz', '❤️': 'heart love red', '💔': 'broken heart sad', '💕': 'hearts love', '💖': 'sparkling heart love', '🖤': 'black heart', '🤍': 'white heart', '💰': 'money bag cash rich', '💸': 'money wings spend', '💵': 'dollar cash money', '🪙': 'coin money', '🎁': 'gift present birthday', '🎉': 'party tada celebrate confetti', '🎊': 'confetti celebrate', '🎂': 'birthday cake', '⚽': 'football soccer ball', '🏀': 'basketball', '🏆': 'trophy win champion', '🥇': 'gold medal first', '🎮': 'game controller video', '🎲': 'dice game', '🚗': 'car drive', '✈️': 'plane flight travel', '🚀': 'rocket launch space', '🏠': 'house home', '📱': 'phone mobile', '💻': 'laptop computer', '📷': 'camera photo', '🎵': 'music note', '🎶': 'music notes song', '☕': 'coffee tea hot', '🍺': 'beer drink', '🍻': 'beers cheers', '🥂': 'cheers toast champagne', '🍷': 'wine glass', '🍕': 'pizza food', '🍔': 'burger food', '🍟': 'fries chips food', '🌹': 'rose flower love', '🌸': 'blossom flower spring', '☀️': 'sun sunny weather', '🌙': 'moon night crescent', '⭐': 'star', '🌟': 'star glowing', '🌈': 'rainbow', '❄️': 'snow cold winter', '🐶': 'dog puppy pet', '🐱': 'cat kitten pet', '🦁': 'lion', '🐴': 'horse', '🦄': 'unicorn magic', '🦋': 'butterfly', '💐': 'flowers bouquet', '🍀': 'clover luck four leaf', '👑': 'crown king queen royal', '💎': 'diamond gem', '🔑': 'key', '🔒': 'lock secure', '📌': 'pin', '✂️': 'scissors cut', '📝': 'memo note write', '✅': 'check yes done tick', '❌': 'cross no wrong x', '❗': 'exclamation important', '❓': 'question mark', '🆘': 'sos help', '🚫': 'no prohibited banned', '⏰': 'alarm clock time', '⌛': 'hourglass time', '💡': 'bulb idea light', '🔔': 'bell notification', '📣': 'megaphone announce', '🎤': 'microphone sing mic', '🎧': 'headphones music', '🏋️': 'gym weights lift', '💃': 'dance woman party', '🕺': 'dance man disco', '👰': 'bride wedding', '💒': 'wedding church', '🤰': 'pregnant', '👶': 'baby', '🎅': 'santa christmas', '🤶': 'mrs claus christmas', '🧧': 'red envelope luck money', '🛒': 'cart shopping', '💳': 'card credit payment', '📦': 'package box delivery', '🚚': 'truck delivery', '⛽': 'fuel petrol gas station', '🛏️': 'bed sleep', '🚿': 'shower bath', '🧼': 'soap wash', '🪥': 'toothbrush teeth', '👟': 'shoe sneaker run', '👗': 'dress fashion', '👜': 'handbag bag fashion', '💄': 'lipstick makeup', '💍': 'ring diamond propose', '🌍': 'earth world globe africa', '🇳🇬': 'nigeria flag naija',
}

export function searchEmojis(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: string[] = []
  for (const cat of EMOJI_CATEGORIES) {
    for (const g of cat.glyphs) {
      const kw = KEYWORDS[g]
      if (kw && kw.includes(q)) hits.push(g)
      else if (cat.label.toLowerCase().includes(q) && hits.length < 120) hits.push(g)
    }
  }
  return [...new Set(hits)].slice(0, 120)
}

const RECENT_KEY = 'intima_emoji_recent'

export function recentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, 24) : []
  } catch {
    return []
  }
}

export function noteEmojiUsed(glyph: string) {
  try {
    const cur = recentEmojis().filter((g) => g !== glyph)
    localStorage.setItem(RECENT_KEY, JSON.stringify([glyph, ...cur].slice(0, 24)))
  } catch {
    /* storage unavailable */
  }
}
