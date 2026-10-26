// An icon for each Easel — Feather icons (MIT), drawn like the app's other
// icons: 2px strokes in the Easel's colour. One picked in Settings wins;
// otherwise every name gets one (see keyFromName).
import { FEATHER } from './featherIcons.js'

// The short names below → Feather icon names
const KEY_TO_FEATHER = {
  cart: 'shopping-cart', dollar: 'dollar-sign', edit: 'edit-3', pin: 'map-pin',
  bag: 'shopping-bag', trending: 'trending-up', pie: 'pie-chart', check: 'check-square',
}
const featherName = (key) => KEY_TO_FEATHER[key] || key

// Words → icon. A word may appear for more than one icon; the earlier row wins.
const WORDS = [
  [['personal', 'me', 'my', 'myself', 'self', 'private', 'mine', 'individual', 'solo', 'own', 'profile', 'identity'], 'user'],
  [['family', 'kids', 'kid', 'children', 'child', 'parents', 'parent', 'friends', 'friend', 'people', 'social', 'team', 'contacts', 'contact', 'relatives', 'mom', 'dad', 'sister', 'brother', 'grandparents', 'cousins', 'neighbors', 'community', 'club', 'group', 'guests', 'roommates', 'coworkers', 'colleagues', 'networking'], 'users'],
  [['work', 'job', 'office', 'business', 'career', 'clients', 'client', 'projects', 'project', 'company', 'meetings', 'meeting', 'professional', 'corporate', 'employer', 'startup', 'consulting', 'freelance', 'hustle', 'interview', 'interviews', 'hiring', 'resume', 'agency', 'firm', 'manager', 'management'], 'briefcase'],
  [['house', 'home', 'household', 'apartment', 'condo', 'chores', 'yard', 'garden', 'gardening', 'property', 'landscape', 'landscaping', 'lawn', 'plants', 'backyard', 'patio', 'deck', 'pool', 'kitchen', 'basement', 'garage', 'remodel', 'interior', 'furniture', 'decor', 'rooms', 'room', 'cleaning', 'laundry', 'mortgage', 'rent', 'landlord', 'nursery', 'bathroom', 'bedroom'], 'home'],
  [['travel', 'trips', 'trip', 'vacation', 'vacations', 'places', 'itinerary', 'roadtrip', 'road', 'flights', 'flight', 'hotel', 'hotels', 'camping', 'hiking', 'adventures', 'adventure', 'tour', 'tours', 'visit', 'visits', 'getaway', 'europe', 'asia', 'disney', 'cruise', 'honeymoon'], 'map'],
  [['world', 'abroad', 'international', 'global', 'language', 'languages', 'culture', 'countries', 'news', 'politics'], 'globe'],
  [['entertainment', 'movies', 'movie', 'films', 'film', 'tv', 'shows', 'show', 'watch', 'watchlist', 'streaming', 'netflix', 'series', 'cinema', 'theater', 'theatre', 'games', 'gaming', 'anime'], 'film'],
  [['orders', 'order', 'deliveries', 'delivery', 'packages', 'package', 'shipping', 'returns', 'return', 'amazon', 'tracking', 'purchases', 'purchase', 'inventory', 'boxes', 'box'], 'package'],
  [['presents', 'present', 'gifts', 'gift', 'christmas', 'birthdays', 'birthday', 'wishlist', 'wishes', 'wish', 'holidays', 'holiday', 'anniversary', 'celebration', 'celebrations', 'party', 'parties', 'surprise', 'surprises'], 'gift'],
  [['easels', 'easel', 'app', 'scribble', 'design', 'designs', 'ux', 'ui', 'product', 'prototype', 'layers', 'mockups', 'figma'], 'layers'],
  [['shopping', 'groceries', 'grocery', 'buy', 'store', 'stores', 'errands', 'supplies', 'costco', 'market', 'wants', 'needs'], 'cart'],
  [['clothes', 'clothing', 'fashion', 'outfits', 'outfit', 'wardrobe', 'style', 'shoes', 'boutique', 'merch', 'jewelry', 'accessories'], 'bag'],
  [['health', 'fitness', 'medical', 'doctor', 'doctors', 'workout', 'workouts', 'gym', 'running', 'run', 'recovery', 'exercise', 'training', 'therapy', 'wellness', 'diet', 'nutrition', 'dentist', 'physical', 'marathon', 'yoga', 'cycling', 'swim', 'sports', 'sport', 'achilles', 'injury', 'rehab', 'pt', 'hospital', 'meds', 'pharmacy'], 'activity'],
  [['love', 'wedding', 'relationship', 'dating', 'partner', 'romance', 'spouse', 'wife', 'husband', 'valentine', 'care', 'charity', 'volunteer', 'volunteering', 'donations', 'kindness', 'gratitude'], 'heart'],
  [['reading', 'books', 'book', 'school', 'study', 'studies', 'learning', 'learn', 'class', 'classes', 'course', 'courses', 'notes', 'journal', 'library', 'college', 'university', 'homework', 'research', 'education', 'thesis', 'essay', 'lessons', 'teaching', 'kindergarten', 'preschool'], 'book'],
  [['music', 'songs', 'song', 'playlist', 'playlists', 'concerts', 'concert', 'band', 'guitar', 'piano', 'records', 'vinyl', 'albums', 'singing', 'choir'], 'music'],
  [['finances', 'finance', 'financial', 'money', 'budget', 'budgets', 'bills', 'bill', 'taxes', 'tax', 'banking', 'bank', 'investing', 'investments', 'expenses', 'savings', 'payments', 'payment', 'insurance', 'accounts', 'retirement', 'salary', 'invoices', 'stocks', 'crypto', 'debt', 'loans', 'costs', 'pricing'], 'dollar'],
  [['events', 'event', 'calendar', 'schedule', 'scheduling', 'plans', 'planning', 'appointments', 'appointment', 'dates', 'deadlines', 'weekly', 'daily', 'monthly', 'yearly', 'agenda', 'routine', 'routines', 'habits', 'week', 'month', 'year', 'season'], 'calendar'],
  [['food', 'recipes', 'recipe', 'cooking', 'cook', 'restaurants', 'restaurant', 'meals', 'meal', 'coffee', 'dinner', 'dinners', 'lunch', 'breakfast', 'baking', 'drinks', 'wine', 'beer', 'cocktails', 'cafe', 'eats', 'snacks', 'brunch', 'menu', 'menus'], 'coffee'],
  [['car', 'cars', 'moving', 'move', 'vehicle', 'vehicles', 'auto', 'truck', 'commute', 'transport', 'transportation', 'logistics', 'boat', 'bike', 'driving'], 'truck'],
  [['repairs', 'repair', 'fix', 'fixes', 'diy', 'maintenance', 'renovation', 'renovations', 'tools', 'tool', 'build', 'building', 'construction', 'handyman', 'woodworking', 'crafts', 'craft', 'hardware', 'install', 'setup'], 'tool'],
  [['photos', 'photo', 'photography', 'pictures', 'picture', 'camera', 'memories', 'albums', 'instagram', 'prints', 'portraits'], 'camera'],
  [['tech', 'technology', 'computer', 'computers', 'gadgets', 'devices', 'software', 'website', 'websites', 'web', 'internet', 'online', 'digital', 'apps', 'ai', 'lens', 'optics', 'vision', 'screen', 'display'], 'monitor'],
  [['code', 'coding', 'dev', 'development', 'programming', 'engineering', 'scripts', 'github', 'api'], 'code'],
  [['goals', 'goal', 'achievements', 'resolutions', 'milestones', 'targets', 'okrs', 'okr', 'objectives', 'focus', 'ambitions', 'kpis'], 'target'],
  [['baby', 'fun', 'play', 'playdate', 'playdates', 'hobbies', 'hobby', 'toys', 'jokes', 'happy', 'happiness', 'joy', 'silly'], 'smile'],
  [['summer', 'outdoors', 'outdoor', 'beach', 'weather', 'sunny', 'spring', 'nature', 'park', 'parks', 'morning', 'mornings'], 'sun'],
  [['winter', 'night', 'nights', 'evening', 'evenings', 'dreams', 'bedtime', 'sleep', 'rest'], 'moon'],
  [['writing', 'write', 'ideas', 'idea', 'creative', 'creativity', 'art', 'drawing', 'painting', 'poems', 'poetry', 'stories', 'story', 'blog', 'novel', 'sketches', 'inspiration'], 'feather'],
  [['drafts', 'draft', 'edits', 'editing', 'brainstorm', 'brainstorming', 'thoughts', 'thinking', 'scratch', 'scratchpad', 'jots', 'scribbles'], 'edit'],
  [['archive', 'archives', 'storage', 'old', 'someday', 'later', 'backlog', 'past', 'history', 'deep', 'vault', 'stash'], 'archive'],
  [['favorites', 'favourites', 'favorite', 'important', 'priority', 'priorities', 'best', 'top', 'starred', 'must', 'key', 'highlights'], 'star'],
  [['todo', 'todos', 'tasks', 'task', 'checklist', 'checklists', 'done', 'lists', 'list', 'action', 'actions', 'next', 'now', 'today'], 'check'],
  [['admin', 'paperwork', 'forms', 'form', 'documents', 'docs', 'records', 'legal', 'contracts', 'applications', 'application', 'permits', 'registration', 'disability', 'claims', 'claim', 'benefits', 'hr', 'visa', 'passport'], 'clipboard'],
  [['email', 'emails', 'mail', 'letters', 'letter', 'newsletter', 'newsletters', 'correspondence', 'messages', 'inbox'], 'mail'],
  [['calls', 'call', 'phone', 'phones'], 'phone'],
  [['mobile', 'iphone', 'android', 'texts'], 'smartphone'],
  [['alerts', 'alert', 'notifications', 'urgent', 'reminder', 'reminders'], 'bell'],
  [['security', 'safety', 'protection', 'emergency', 'backup', 'backups', 'warranty', 'warranties'], 'shield'],
  [['passwords', 'password', 'secret', 'secrets', 'privacy', 'keys', 'logins', 'accounts info'], 'lock'],
  [['sales', 'growth', 'marketing', 'metrics', 'analytics', 'stats', 'trading', 'progress', 'improvement'], 'trending'],
  [['data', 'reports', 'report', 'charts', 'dashboard', 'surveys', 'results'], 'pie'],
  [['energy', 'power', 'electric', 'electricity', 'utilities', 'quick', 'fast', 'ideas quick'], 'zap'],
  [['water', 'plumbing', 'rain', 'hydration', 'aquarium'], 'droplet'],
  [['cloud', 'sky', 'uploads', 'sync'], 'cloud'],
  [['local', 'nearby', 'neighborhood', 'town', 'city', 'spots', 'locations', 'location', 'addresses', 'address', 'venues'], 'pin'],
  [['explore', 'exploring', 'discover', 'discovery', 'direction', 'directions', 'guide', 'guides', 'curious', 'wander'], 'compass'],
  [['outreach', 'invites', 'invitations', 'invitation', 'rsvp', 'rsvps', 'submissions'], 'send'],
  [['podcast', 'podcasts', 'talks', 'speaking', 'presentations', 'presentation', 'voice', 'recordings'], 'mic'],
  [['videos', 'youtube', 'vlog', 'filming', 'tiktok'], 'video'],
  [['hair', 'haircut', 'beauty', 'grooming', 'barber', 'salon', 'sewing', 'pets', 'pet', 'dog', 'dogs', 'cat', 'cats', 'vet'], 'scissors'],
  [['labels', 'tags', 'categories', 'sorting', 'organize', 'organizing', 'organization', 'sale', 'deals', 'coupons'], 'tag'],
  [['flags', 'milestone', 'launch', 'launches', 'campaign', 'campaigns', 'country', 'mission'], 'flag'],
  [['saved', 'save', 'bookmarks', 'reading list', 'links', 'resources', 'references', 'reference', 'articles'], 'bookmark'],
  [['marine', 'sailing', 'nautical', 'harbor', 'lake', 'fishing'], 'anchor'],
  [['temperature', 'heating', 'hvac', 'sick', 'illness', 'fever', 'flu'], 'thermometer'],
  [['overview', 'board', 'boards', 'hub', 'collection', 'collections', 'gallery', 'all'], 'grid'],
  [['misc', 'miscellaneous', 'other', 'others', 'stuff', 'things', 'random', 'general', 'various', 'assorted', 'extras', 'everything'], 'folder'],
]

// Every Easel gets an icon. The search widens step by step until something
// fits, from closest to loosest:
//   1. a whole phrase from the list ("reading list")
//   2. a word in the name, exactly
//   3. its other forms — plural, "-ing", "-ed", "-er" ("Gifts" → gift,
//      "Landscaping" → landscape)
//   4. a shared stem — the first 5 letters ("Photographer" → photography)
//   5. one word inside another ("Housework" → house, "AfferaLens" → lens)
//   6. a single unfamiliar word is most likely a name → a person
//   7. a number or year → the calendar
//   8. anything else is a collection of things → a folder
const ALL = WORDS.flatMap(([keys, icon]) => keys.map(k => [k, icon]))
const forms = (w) => {
  const out = [w]
  const add = (x) => { if (x && x.length >= 2 && !out.includes(x)) out.push(x) }
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) add(w.slice(0, -2))
  if (w.endsWith('s')) add(w.slice(0, -1))
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e') }
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)) }
  if (w.endsWith('ers')) add(w.slice(0, -3))
  if (w.endsWith('er')) { add(w.slice(0, -2)); add(w.slice(0, -1)) }
  return out
}
function keyFromName(name) {
  const raw = String(name || '').trim()
  // camelCase splits too ("AfferaLens" → affera lens)
  const words = raw.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const phrase = words.join(' ')
  for (const [k, icon] of ALL) if (k.includes(' ') && phrase.includes(k)) return icon
  for (const w of words) for (const [k, icon] of ALL) if (k === w) return icon
  for (const w of words) for (const f of forms(w)) for (const [k, icon] of ALL) if (k === f) return icon
  for (const w of words) {
    if (w.length < 5) continue
    for (const [k, icon] of ALL) if (k.length >= 5 && k.slice(0, 5) === w.slice(0, 5)) return icon
  }
  for (const w of words) {
    for (const [k, icon] of ALL) {
      if (k.includes(' ')) continue
      if ((k.length >= 4 && w.includes(k)) || (w.length >= 4 && k.includes(w))) return icon
    }
  }
  if (words.length === 1 && /^[A-Z][a-z]+$/.test(raw)) return 'user'
  if (words.some(w => /^\d+$/.test(w))) return 'calendar'
  return 'folder'
}

// The Easel's icon: the one picked in Settings, else the one its name picks.
// Always a Feather icon name.
export function easelIconKey(name, icon) {
  if (icon && FEATHER[icon]) return icon
  return featherName(keyFromName(name))
}

// Every icon, for the picker, with what a search can find it by: its name, its
// Feather tags, and the words that pick it from an Easel's name.
const NAME_WORDS = {}
for (const [keys, key] of WORDS) {
  const f = featherName(key)
  NAME_WORDS[f] = (NAME_WORDS[f] ? NAME_WORDS[f] + ' ' : '') + keys.join(' ')
}
export const ALL_ICONS = Object.keys(FEATHER).map(n => ({
  name: n,
  terms: `${n.replace(/-/g, ' ')} ${FEATHER[n][1]} ${NAME_WORDS[n] || ''}`.toLowerCase(),
}))

// The Easel's icon
export function EaselNameIcon({ name, icon, color, size = 18, className, style }) {
  const key = easelIconKey(name, icon)
  return (
    <svg className={`easel-name-icon${className ? ' ' + className : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, stroke: color || 'currentColor', ...style }}
      dangerouslySetInnerHTML={{ __html: (FEATHER[key] || FEATHER.folder)[0] }}/>
  )
}
