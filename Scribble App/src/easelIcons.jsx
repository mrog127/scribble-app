// An icon for each Easel, picked from its name — Feather icons (MIT), drawn
// like the app's other icons: 2px strokes in the Easel's dark colour. Every
// name gets one (see easelIconKey).

// Feather icon drawings (24×24)
const ICONS = {
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  map: <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></>,
  film: <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></>,
  package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
  gift: <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
  cart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
  heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
  activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
  book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  dollar: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  coffee: <><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></>,
  truck: <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
  tool: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></>,
  camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
  smile: <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>,
  sun: <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
  moon: <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
  feather: <><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></>,
  edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>,
  archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
  star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
  code: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
  globe: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>,
  tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
  mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
  phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>,
  smartphone: <><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>,
  target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
  zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
  cloud: <><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></>,
  droplet: <><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></>,
  compass: <><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></>,
  pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  video: <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>,
  mic: <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>,
  bag: <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
  scissors: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></>,
  trending: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
  pie: <><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  anchor: <><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></>,
  clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></>,
  check: <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  thermometer: <><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></>,
  send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  bookmark: <><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></>,
  grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
}

// Words → icon. A word may appear for more than one icon; the earlier row wins.
const WORDS = [
  [['personal', 'me', 'my', 'myself', 'self', 'private', 'mine', 'individual', 'solo', 'own', 'profile', 'identity'], 'user'],
  [['family', 'kids', 'kid', 'children', 'child', 'parents', 'parent', 'friends', 'friend', 'people', 'social', 'team', 'contacts', 'contact', 'relatives', 'mom', 'dad', 'sister', 'brother', 'grandparents', 'cousins', 'neighbors', 'community', 'club', 'group', 'guests', 'roommates', 'coworkers', 'colleagues', 'networking'], 'users'],
  [['work', 'job', 'office', 'business', 'career', 'clients', 'client', 'projects', 'project', 'company', 'meetings', 'meeting', 'professional', 'corporate', 'employer', 'startup', 'consulting', 'freelance', 'hustle', 'interview', 'interviews', 'hiring', 'resume', 'agency', 'firm', 'manager', 'management'], 'briefcase'],
  [['house', 'home', 'household', 'apartment', 'condo', 'chores', 'yard', 'garden', 'gardening', 'property', 'landscape', 'lawn', 'plants', 'backyard', 'patio', 'deck', 'pool', 'kitchen', 'basement', 'garage', 'remodel', 'interior', 'furniture', 'decor', 'rooms', 'room', 'cleaning', 'laundry', 'mortgage', 'rent', 'landlord', 'nursery', 'bathroom', 'bedroom'], 'home'],
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
export function easelIconKey(name) {
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

// The Easel's icon
export function EaselNameIcon({ name, color, size = 18, className, style }) {
  const key = easelIconKey(name)
  return (
    <svg className={`easel-name-icon${className ? ' ' + className : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, stroke: color || 'currentColor', ...style }}>
      {ICONS[key]}
    </svg>
  )
}
