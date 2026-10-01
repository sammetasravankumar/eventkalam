import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Compass,
  GraduationCap,
  LayoutDashboard,
  Linkedin,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Ticket,
  Users,
  X,
  Zap,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Copy,
  Building2,
  Tag,
  IndianRupee,
  Upload,
  CheckCircle2,
} from 'lucide-react';
import { supabase, type UserProfile, type EventRow, type Registration } from '@/lib/supabase';

type View = 'home' | 'events' | 'eventDetail' | 'about' | 'contact' | 'login' | 'dashboard' | 'admin' | 'adminLogin' | 'resetPassword';

const asset = (folder: string, name: string) => `/assets/images/${folder}/${name}`;
const logo = asset('logo', 'WhatsApp_Image_2026-09-28_at_11.29.33_AM.jpeg');
const heroImage = asset('backgrounds', 'WhatsApp_Image_2026-09-28_at_10.35.52_AM.jpeg');
const fallbackImages = [
  asset('events', 'WhatsApp_Image_2026-09-28_at_10.35.52_AM_(1).jpeg'),
  asset('events', 'WhatsApp_Image_2026-09-28_at_10.40.16_AM_(1).jpeg'),
  asset('events', 'WhatsApp_Image_2026-09-28_at_10.45.09_AM.jpeg'),
];

const categories = [
  { name: 'Workshops', icon: Zap, text: 'Learn by doing with practical sessions led by people in the field.' },
  { name: 'Hackathons', icon: Sparkles, text: 'Turn bold ideas into working prototypes with a team beside you.' },
  { name: 'Career fairs', icon: Compass, text: 'Meet organisations, ask better questions and make a strong first impression.' },
  { name: 'Cultural fests', icon: MessageCircle, text: 'Celebrate the voices, art and energy that make every campus unique.' },
];

function getTone(category: string): string {
  const map: Record<string, string> = { Workshop: 'lime', Seminar: 'blue', Community: 'cyan', Career: 'blue', Networking: 'lime', Cultural: 'cyan', Hackathon: 'lime' };
  return map[category] || 'blue';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isEventCompleted(event: EventRow): boolean {
  if (!event.date) return false;
  try {
    const eventDate = new Date(event.date);
    eventDate.setHours(23, 59, 59, 999);
    return eventDate < new Date();
  } catch {
    return false;
  }
}

function eventStartTimestamp(event: EventRow): number {
  const date = new Date(`${event.date}T00:00:00`);
  const startTime = event.time.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!startTime) return date.getTime();
  let hours = Number(startTime[1]) % 12;
  if (startTime[3].toUpperCase() === 'PM') hours += 12;
  date.setHours(hours, Number(startTime[2] || 0), 0, 0);
  return date.getTime();
}

function eventSortTimestamp(event: EventRow): number {
  return eventStartTimestamp(event);
}

function compareEvents(a: EventRow, b: EventRow): number {
  const aTime = eventSortTimestamp(a);
  const bTime = eventSortTimestamp(b);
  const aCompleted = isEventCompleted(a);
  const bCompleted = isEventCompleted(b);
  if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
  if (aCompleted && bCompleted) return bTime - aTime;

  const today = new Date().toISOString().slice(0, 10);
  const aToday = a.date === today;
  const bToday = b.date === today;
  if (aToday !== bToday) return aToday ? 1 : -1;
  return aTime - bTime;
}

function availableSeats(event: EventRow): number {
  return Math.max(event.capacity - event.registered_count, 0);
}

function isRegistered(event: EventRow, userId: string | null): boolean {
  if (!userId) return false;
  return event.registrations.some(
    (r) => r.user_id === userId && r.registration_status === 'registered'
  );
}

function App() {
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All events');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('eventkalam-theme');
    if (savedTheme === 'light') setDark(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    window.localStorage.setItem('eventkalam-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Fetch profile from DB. Sets profile state on success. Caller controls authLoading.
  const loadProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('EventKalam: Profile load error:', error.message);
      return null;
    }
    if (data) {
      setProfile(data as UserProfile);
      return data as UserProfile;
    }
    return null;
  }, []);

  // Load profile with retries — needed after signup when the DB trigger may not have run yet
  const loadProfileWithRetry = useCallback(async (userId: string, maxAttempts = 5): Promise<UserProfile | null> => {
    const delays = [0, 600, 1200, 2000, 3000];
    for (let i = 0; i < maxAttempts; i++) {
      if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));
      const result = await loadProfile(userId);
      if (result) return result;
    }
    return null;
  }, [loadProfile]);

  // Auth state — single source of truth
  useEffect(() => {
    let mounted = true;
    // Restore session on page load/refresh
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session) {
        const fetched = await loadProfileWithRetry(data.session.user.id);
        if (mounted) setAuthLoading(false);
        if (!fetched) console.warn('EventKalam: Profile not found after session restore.');
      } else {
        setAuthLoading(false);
      }
    });
    // Only respond to definitive auth events
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setAuthLoading(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset link in the email — show the reset page
        setAuthLoading(false);
        setView('resetPassword');
      }
      // SIGNED_IN is handled by the onLogin callback in LoginPage to avoid double-loading
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfileWithRetry]);

  // Load published events
  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .in('status', ['published', 'completed']);
    if (error) {
      console.error('EventKalam: Failed to load events:', error.message);
      setEvents([]);
    } else {
      setEvents(((data || []) as EventRow[]).sort(compareEvents));
    }
    setEventsLoading(false);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, refreshKey]);

  const go = (next: View) => {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    go('eventDetail');
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    await supabase.auth.signOut();
    setProfile(null);
    setAuthLoading(false);
    setToast('You have been signed out.');
    go('home');
  };

  const filteredEvents = useMemo(() => events.filter((event) => {
    const matchesSearch = `${event.title} ${event.category} ${event.venue} ${event.city}`.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All events' || event.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }), [events, search, selectedCategory]);

  const selectedEvent = useMemo(() => events.find((e) => e.event_id === selectedEventId) || null, [events, selectedEventId]);

  const isAdmin = profile?.role === 'admin';

  // Safety timeout: if authLoading stays true too long (e.g., both profile loads errored), release it
  useEffect(() => {
    if (!authLoading) return;
    const timer = setTimeout(() => setAuthLoading(false), 6000);
    return () => clearTimeout(timer);
  }, [authLoading]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="skip-link" onClick={() => document.getElementById('main-content')?.focus()}>Skip to content</button>
        <div className="nav-wrap">
          <button className="brand" onClick={() => go('home')} aria-label="EventKalam home">
            <img src={logo} alt="EventKalam" />
          </button>
          <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Primary navigation">
            <NavItem label="Home" active={view === 'home'} onClick={() => go('home')} />
            <NavItem label="Events" active={view === 'events' || view === 'eventDetail'} onClick={() => go('events')} />
            <NavItem label="About" active={view === 'about'} onClick={() => go('about')} />
            <NavItem label={isAdmin ? 'Admin Dashboard' : 'My Dashboard'} active={view === 'dashboard' || (isAdmin && view === 'admin')} onClick={() => profile ? (isAdmin ? go('admin') : go('dashboard')) : go('login')} />
            {isAdmin && <NavItem label="My Profile" active={view === 'dashboard'} onClick={() => go('dashboard')} />}
            <NavItem label="Contact" active={view === 'contact'} onClick={() => go('contact')} />
          </nav>
          <div className="nav-actions">
            <button className="icon-btn theme-btn" onClick={() => setDark((current) => !current)} aria-label="Toggle theme">
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {authLoading ? (
              <Loader2 size={18} className="spin" />
            ) : profile ? (
              <div className="nav-user-wrap">
                <button className="profile-chip" onClick={() => go('dashboard')}>
                  <span>{profile.name.charAt(0).toUpperCase()}</span>
                  <span className="profile-label">{profile.name.split(' ')[0]}</span>
                  <ChevronDown size={14} />
                </button>
                <button className="icon-btn logout-btn" onClick={handleSignOut} aria-label="Sign out" title="Sign out">
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button className="button button-primary nav-login" onClick={() => go('login')}><LogIn size={16} /> Sign in</button>
            )}
            <button className="menu-toggle" onClick={() => setMenuOpen((current) => !current)} aria-label="Toggle menu">{menuOpen ? <X /> : <Menu />}</button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {view === 'home' && <Home go={go} openEvent={openEvent} events={events} loading={eventsLoading} profile={profile} />}
        {view === 'events' && <EventsPage events={filteredEvents} search={search} setSearch={setSearch} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} openEvent={openEvent} loading={eventsLoading} />}
        {view === 'eventDetail' && selectedEvent && (
          <EventDetailPage event={selectedEvent} profile={profile} go={go} goLogin={() => go('login')} onRegistered={() => { setRefreshKey(k => k + 1); }} setToast={setToast} />
        )}
        {view === 'eventDetail' && !selectedEvent && (
          <div className="page-content page-width"><div className="empty-state"><AlertCircle size={30} /><h3>Event not found.</h3><button className="button button-primary" onClick={() => go('events')}>Back to events</button></div></div>
        )}
        {view === 'about' && <AboutPage go={go} />}
        {view === 'contact' && <ContactPage setToast={setToast} />}
        {view === 'login' && <LoginPage onLogin={async (isNewUser?: boolean) => {
          setAuthLoading(true);
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // New users need more retries — DB trigger may not have run yet
            const fetchedProfile = await loadProfileWithRetry(user.id, isNewUser ? 5 : 3);
            setAuthLoading(false);
            if (fetchedProfile) {
              setToast(isNewUser ? 'Welcome to EventKalam!' : 'Welcome back to EventKalam.');
              if (fetchedProfile.role === 'admin') {
                go('admin');
              } else {
                go('dashboard');
              }
            } else {
              setToast('Account created. Please sign in.');
              // Profile not ready yet — stay on login so user can sign in manually
            }
          } else {
            setAuthLoading(false);
          }
        }} go={go} />}
        {view === 'dashboard' && authLoading && <div className="page-content page-width"><div className="empty-state"><Loader2 size={30} className="spin" /><h3>Loading your dashboard...</h3></div></div>}
        {view === 'dashboard' && !authLoading && profile && <Dashboard profile={profile} events={events} go={go} onAction={() => setRefreshKey(k => k + 1)} setToast={setToast} />}
        {view === 'dashboard' && !authLoading && !profile && <div className="page-content page-width"><div className="empty-state"><AlertCircle size={30} /><h3>Please sign in to view your dashboard.</h3><button className="button button-primary" onClick={() => go('login')}>Sign in</button></div></div>}
        {view === 'admin' && authLoading && <div className="page-content page-width"><div className="empty-state"><Loader2 size={30} className="spin" /><h3>Loading admin dashboard...</h3></div></div>}
        {view === 'admin' && !authLoading && isAdmin && profile && <AdminPage profile={profile} go={go} setToast={setToast} onAction={() => setRefreshKey(k => k + 1)} />}
        {view === 'admin' && !authLoading && !isAdmin && <div className="page-content page-width"><div className="empty-state"><ShieldCheck size={30} /><h3>Admin access required.</h3><button className="button button-primary" onClick={() => go('home')}>Back home</button></div></div>}
        {view === 'resetPassword' && <ResetPasswordPage go={go} setToast={setToast} />}
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-brand"><img src={logo} alt="EventKalam" /><p>More than a calendar. A place to find your next beginning.</p><div className="socials"><button aria-label="LinkedIn"><Linkedin size={17} /></button><button aria-label="Email"><Mail size={17} /></button><button aria-label="Messages"><MessageCircle size={17} /></button></div></div>
          <div><p className="footer-heading">Explore</p><button onClick={() => go('events')}>All events</button><button onClick={() => go('about')}>Our story</button><button onClick={() => go('contact')}>Contact us</button></div>
          <div><p className="footer-heading">Stay in the loop</p><p className="footer-muted">One thoughtful email when something worth showing up for is happening.</p><div className="newsletter"><input aria-label="Email address" placeholder="Your email address" type="email" /><button aria-label="Subscribe"><ArrowRight size={17} /></button></div></div>
        </div>
        <div className="footer-bottom"><span>© 2026 EventKalam</span><span>Built for curious minds in every campus.</span></div>
      </footer>
      {toast && <div className="toast" role="status"><Check size={17} /> {toast}</div>}
    </div>
  );
}

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>{label}</button>;
}

// ============================================================
// HOME
// ============================================================
function Home({ go, openEvent, events, loading, profile }: { go: (view: View) => void; openEvent: (id: string) => void; events: EventRow[]; loading: boolean; profile: UserProfile | null }) {
  const upcoming = events.filter((event) => !isEventCompleted(event)).slice(0, 3);
  return <>
    <section className="hero-section">
      <div className="hero-bg" style={{ backgroundImage: `url("${heroImage}")` }} />
      <div className="hero-overlay" />
      <div className="hero-content page-width">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> The student event platform</p>
          <h1>Find the room where your <span>next chapter</span> begins.</h1>
          <p className="hero-description">Workshops, ideas, people and opportunities that move you forward. Explore what is happening around you and make your next yes count.</p>
          <div className="hero-actions"><button className="button button-primary" onClick={() => go('events')}>Explore events <ArrowRight size={17} /></button><button className="button button-ghost" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button></div>
          <div className="hero-proof"><div className="avatar-stack"><span>R</span><span>N</span><span>K</span><span>+</span></div><div><strong>12,000+ students</strong><small>already showing up with purpose</small></div></div>
        </div>
        <div className="hero-feature"><div className="feature-image-wrap"><img src={asset('logo', 'WhatsApp_Image_2026-09-28_at_10.35.52_AM_(1).jpeg')} alt="Students celebrating at an event" /></div><div className="floating-card float-top"><span className="mini-icon lime"><CalendarDays size={17} /></span><div><strong>{events.length}</strong><small>events live now</small></div></div><div className="floating-card float-bottom"><span className="mini-icon blue"><Users size={17} /></span><div><strong>4.9 / 5</strong><small>student experience</small></div></div></div>
      </div>
      <div className="hero-stats page-width"><Stat number={String(events.length)} label="Events hosted" /><Stat number="12K+" label="Students connected" /><Stat number="48" label="Campus partners" /></div>
    </section>
    <section className="section page-width upcoming-section"><SectionHeading eyebrow="Don't miss what matters" title="Upcoming events & timings" text="Good things happen when you know where to look. Find your next workshop, conversation or opportunity." action={<button className="text-button" onClick={() => go('events')}>View all events <ArrowRight size={16} /></button>} />
      {loading ? (
        <div className="event-grid featured-grid">{[0,1,2].map((i) => <div key={i} className="skeleton-card" />)}</div>
      ) : upcoming.length ? (
        <div className="event-grid featured-grid">{upcoming.map((event) => <EventCard key={event.event_id} event={event} onOpen={() => openEvent(event.event_id)} />)}</div>
      ) : (
        <div className="empty-state"><Compass size={30} /><h3>No upcoming events yet.</h3><p>Check back soon — new events are added regularly.</p></div>
      )}
    </section>
    <section className="section categories-section"><div className="page-width"><SectionHeading eyebrow="A place for every interest" title="Choose your kind of momentum" text="Whether you want to build, perform, connect or learn, there is a place for you here." /><div className="category-grid">{categories.map(({ name, icon: Icon, text }) => <button className="category-card" key={name} onClick={() => go('events')}><span className="category-icon"><Icon size={22} /></span><span><strong>{name}</strong><small>{text}</small></span><ArrowRight size={18} /></button>)}</div></div></section>
    <section className="section process-section" id="how-it-works"><div className="page-width"><SectionHeading eyebrow="Simple by design" title="From curious to connected" text="A few small steps can change the direction of a semester." /><div className="process-grid"><ProcessStep number="01" icon={Search} title="Browse" text="Find an event that feels like a good use of your time." /><ProcessStep number="02" icon={Ticket} title="Register" text="Save your place in seconds, without the long forms." /><ProcessStep number="03" icon={GraduationCap} title="Participate" text="Show up, learn something and leave with more than you came with." /></div></div></section>
    <section className="quote-section"><div className="page-width quote-inner"><span className="quote-mark">"</span><blockquote>EventKalam helped me find a workshop outside my course. I walked in nervous and walked out with a project, a mentor and two new friends.</blockquote><div className="quote-author"><span className="author-avatar">SM</span><span><strong>Sneha M.</strong><small>Final year student, Warangal</small></span></div></div></section>
    <section className="cta-section page-width"><div><p className="eyebrow">Your next opportunity is closer than you think</p><h2>Make room for a little more possibility.</h2></div><button className="button button-light" onClick={() => go('events')}>Explore events <ArrowRight size={17} /></button></section>
  </>;
}

function Stat({ number, label }: { number: string; label: string }) { return <div className="stat"><strong>{number}</strong><span>{label}</span></div>; }
function SectionHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) { return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{text}</p></div>{action}</div>; }
function ProcessStep({ number, icon: Icon, title, text }: { number: string; icon: typeof Search; title: string; text: string }) { return <div className="process-step"><span className="step-number">{number}</span><Icon size={23} /><h3>{title}</h3><p>{text}</p></div>; }

// ============================================================
// EVENT CARD
// ============================================================
function EventCard({ event, onOpen }: { event: EventRow; onOpen: () => void }) {
  const seats = availableSeats(event);
  const percent = event.capacity > 0 ? Math.round((seats / event.capacity) * 100) : 0;
  const statusLabel = seats === 0 ? 'Sold out' : percent < 20 ? 'Filling fast' : 'Open';
  const completed = isEventCompleted(event);
  return (
    <article className="event-card" onClick={onOpen} style={{ cursor: 'pointer' }}>
      <div className="event-image">
        <img src={event.image_url || fallbackImages[0]} alt={event.title} loading="lazy" style={completed ? { filter: 'brightness(0.6)' } : undefined} />
        {completed && (
          <div className="event-completed-overlay">
            <CheckCircle2 size={18} />
            COMPLETED
          </div>
        )}
        <span className={`event-badge ${getTone(event.category)}`}>{event.category}</span>
        {!completed && <span className="event-status">{statusLabel}</span>}
      </div>
      <div className="event-body">
        <div className="event-meta">
          <span><CalendarDays size={14} /> {formatDate(event.date)}</span>
          <span><Clock3 size={14} /> {event.time}</span>
        </div>
        <h3>{event.title}</h3>
        <p>{event.description}</p>
        <div className="event-location"><MapPin size={15} /> {event.venue}{event.city ? `, ${event.city}` : ''}</div>
        <div className="seats-row">
          <span>{seats} seats left</span>
          <div className="seat-bar"><span style={{ width: `${percent}%` }} /></div>
        </div>
        <button className="button button-outline" onClick={(e) => { e.stopPropagation(); onOpen(); }}>View details <ArrowRight size={16} /></button>
      </div>
    </article>
  );
}

// ============================================================
// EVENTS LIST PAGE
// ============================================================
function EventsPage({ events, search, setSearch, selectedCategory, setSelectedCategory, openEvent, loading }: {
  events: EventRow[]; search: string; setSearch: (value: string) => void; selectedCategory: string; setSelectedCategory: (value: string) => void; openEvent: (id: string) => void; loading: boolean;
}) {
  return (
    <section className="page-content page-width">
      <div className="page-intro">
        <p className="eyebrow"><span className="eyebrow-dot" /> Find your next yes</p>
        <h1>Events worth showing up for.</h1>
        <p>Explore workshops, conversations, meetups and experiences designed to help students and graduates move forward.</p>
      </div>
      <div className="event-toolbar">
        <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events, interests or places" /></label>
        <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} aria-label="Filter by category">
          <option>All events</option><option>Workshop</option><option>Seminar</option><option>Community</option><option>Career</option><option>Networking</option><option>Cultural</option><option>Hackathon</option>
        </select>
      </div>
      {loading ? (
        <div className="event-grid all-events-grid">{[0,1,2,3,4,5].map((i) => <div key={i} className="skeleton-card" />)}</div>
      ) : events.length ? (
        <div className="event-grid all-events-grid">{events.map((event) => <EventCard key={event.event_id} event={event} onOpen={() => openEvent(event.event_id)} />)}</div>
      ) : (
        <div className="empty-state"><Compass size={30} /><h3>Nothing matched that search.</h3><p>Try a different word or explore all events.</p></div>
      )}
    </section>
  );
}

// ============================================================
// EVENT DETAIL + REGISTRATION
// ============================================================
function EventDetailPage({ event, profile, go, goLogin, onRegistered, setToast }: {
  event: EventRow; profile: UserProfile | null; go: (view: View) => void; goLogin: () => void; onRegistered: () => void; setToast: (value: string) => void;
}) {
  const [showRegForm, setShowRegForm] = useState(false);
  const [seats, setSeats] = useState(1);
  const [phone, setPhone] = useState(profile?.phone || '');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<Registration | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const seatsLeft = availableSeats(event);
  const registered = isRegistered(event, profile?.user_id || null);
  const myReg = event.registrations.find((r) => r.user_id === profile?.user_id && r.registration_status === 'registered');
  const completed = isEventCompleted(event);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (completed) { setToast('This event has already been completed.'); return; }
    if (!profile) { goLogin(); return; }
    if (seats < 1) { setToast('Please select at least one seat.'); return; }
    if (seats > seatsLeft) { setToast(`Only ${seatsLeft} seats available.`); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc('register_for_event', {
      p_event_id: event.event_id,
      p_seats: seats,
      p_phone: phone,
    });
    setLoading(false);
    if (error) {
      setToast(error.message || 'Registration failed.');
      return;
    }
    const result = data as { success: boolean; error?: string; registration_id?: string; seats?: number; total_amount?: number };
    if (!result.success) {
      setToast(result.error || 'Registration failed.');
      return;
    }
    const newReg: Registration = {
      registration_id: result.registration_id || '',
      user_id: profile.user_id,
      user_name: profile.name,
      user_email: profile.email,
      phone,
      seats: result.seats || seats,
      total_amount: result.total_amount || 0,
      registration_date: new Date().toISOString(),
      registration_status: 'registered',
    };
    setConfirmation(newReg);
    setToast('Registration confirmed!');
    onRegistered();
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    const { data, error } = await supabase.rpc('cancel_registration', { p_event_id: event.event_id });
    setCancelLoading(false);
    if (error) { setToast(error.message || 'Cancel failed.'); return; }
    const result = data as { success: boolean; error?: string };
    if (!result.success) { setToast(result.error || 'Cancel failed.'); return; }
    setToast('Registration cancelled.');
    onRegistered();
  };

  const copyRegId = () => {
    if (confirmation) {
      navigator.clipboard.writeText(confirmation.registration_id);
      setToast('Registration ID copied.');
    }
  };

  return (
    <section className="page-content page-width event-detail-page">
      <button className="text-button" onClick={() => go('events')} style={{ marginBottom: 24 }}><ArrowLeft size={16} /> Back to events</button>
      <div className="event-detail-layout">
        <div className="event-detail-main">
          <div className="event-detail-banner">
            <img src={event.image_url || fallbackImages[0]} alt={event.title} />
            <span className={`event-badge ${getTone(event.category)}`}>{event.category}</span>
          </div>
          <h1>{event.title}</h1>
          <div className="event-detail-meta">
            <span><CalendarDays size={16} /> {formatDate(event.date)}</span>
            <span><Clock3 size={16} /> {event.time}</span>
            <span><MapPin size={16} /> {event.venue}{event.city ? `, ${event.city}` : ''}</span>
            <span><Tag size={16} /> {event.price === 0 ? 'Free' : `₹${event.price}`}</span>
          </div>
          <p className="event-detail-desc">{event.description}</p>
          <div className="event-detail-info-grid">
            <div className="info-item"><Building2 size={18} /><div><strong>Venue</strong><span>{event.venue}</span></div></div>
            <div className="info-item"><MapPin size={18} /><div><strong>City</strong><span>{event.city}</span></div></div>
            <div className="info-item"><Users size={18} /><div><strong>Capacity</strong><span>{event.capacity} seats</span></div></div>
            <div className="info-item"><Ticket size={18} /><div><strong>Available</strong><span>{seatsLeft} seats left</span></div></div>
          </div>
        </div>

        <div className="event-detail-sidebar">
          {completed ? (
            <div className="reg-sidebar-card">
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <CheckCircle2 size={36} style={{ color: 'var(--muted)', margin: '0 auto 10px' }} />
                <p style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 13, margin: 0 }}>This event has been completed.</p>
                <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6 }}>Registration is no longer available.</p>
              </div>
              <button className="button button-outline" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>Event Completed</button>
            </div>
          ) : confirmation ? (
            <div className="reg-confirmation">
              <div className="reg-confirm-icon"><Check size={32} /></div>
              <h3>Registration confirmed!</h3>
              <p>You are registered for <strong>{event.title}</strong>.</p>
              <div className="reg-id-box">
                <span className="reg-id-label">Registration ID</span>
                <div className="reg-id-value">{confirmation.registration_id.slice(0, 8).toUpperCase()}</div>
                <button className="copy-btn" onClick={copyRegId}><Copy size={14} /> Copy full ID</button>
              </div>
              <div className="reg-details">
                <div><span>Seats</span><strong>{confirmation.seats}</strong></div>
                <div><span>Amount</span><strong>{confirmation.total_amount === 0 ? 'Free' : `₹${confirmation.total_amount}`}</strong></div>
                <div><span>Date</span><strong>{formatDate(event.date)}</strong></div>
                <div><span>Time</span><strong>{event.time}</strong></div>
              </div>
              <button className="button button-primary" onClick={() => go('dashboard')}>Go to dashboard <ArrowRight size={16} /></button>
              <button className="button button-ghost" onClick={() => go('events')}>Browse more events</button>
            </div>
          ) : showRegForm ? (
            <div className="reg-form-wrap">
              <h3>Register for this event</h3>
              <p className="reg-form-sub">{seatsLeft} seats available</p>
              <form onSubmit={handleRegister} className="reg-form">
                <label>Phone number<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone number" /></label>
                <label>Number of seats
                  <select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
                    {Array.from({ length: Math.min(seatsLeft, 5) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <div className="reg-total">
                  <span>Total amount</span>
                  <strong>{event.price * seats === 0 ? 'Free' : `₹${event.price * seats}`}</strong>
                </div>
                <button className="button button-primary" type="submit" disabled={loading}>{loading ? <Loader2 size={16} className="spin" /> : <>Confirm registration <ArrowRight size={16} /></>}</button>
                <button className="button button-ghost" type="button" onClick={() => setShowRegForm(false)}>Cancel</button>
              </form>
            </div>
          ) : (
            <div className="reg-sidebar-card">
              <div className="reg-seats-info">
                <span className="reg-seats-label">Available seats</span>
                <strong className="reg-seats-value">{seatsLeft}</strong>
                <span className="reg-seats-total">of {event.capacity} total</span>
                <div className="seat-bar" style={{ marginTop: 10 }}><span style={{ width: `${event.capacity > 0 ? (seatsLeft / event.capacity) * 100 : 0}%` }} /></div>
              </div>
              {registered && myReg ? (
                <>
                  <div className="reg-status-badge"><Check size={16} /> You're registered</div>
                  <div className="reg-id-mini">ID: {myReg.registration_id.slice(0, 8).toUpperCase()}</div>
                  <button className="button button-registered" disabled>Registered</button>
                  <button className="button button-danger" onClick={handleCancel} disabled={cancelLoading}>{cancelLoading ? <Loader2 size={16} className="spin" /> : <>Cancel registration</>}</button>
                </>
              ) : seatsLeft === 0 ? (
                <>
                  <div className="reg-status-badge sold-out"><AlertCircle size={16} /> Sold out</div>
                  <button className="button button-outline" disabled>Sold out</button>
                </>
              ) : !profile ? (
                <>
                  <p className="reg-login-prompt">Sign in to register for this event.</p>
                  <button className="button button-primary" onClick={goLogin}>Sign in to register <ArrowRight size={16} /></button>
                </>
              ) : (
                <button className="button button-primary" onClick={() => setShowRegForm(true)}>Register now <ArrowRight size={16} /></button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// ABOUT
// ============================================================
function AboutPage({ go }: { go: (view: View) => void }) {
  return <section className="page-content page-width about-page"><div className="page-intro"><p className="eyebrow"><span className="eyebrow-dot" /> Why EventKalam exists</p><h1>We believe showing up changes everything.</h1><p>EventKalam was created for the in-between moments: when you are curious, not quite sure, and ready for something new.</p></div><div className="about-feature"><img src={heroImage} alt="Students and graduates connecting through an event" /><div><p className="eyebrow">Our point of view</p><h2>Opportunity should feel close, clear and welcoming.</h2><p>Students do not need more noise. They need better pathways to people, ideas and experiences that make their future feel a little more possible. We bring those pathways into one thoughtful place.</p><button className="button button-primary" onClick={() => go('events')}>Find your next event <ArrowRight size={17} /></button></div></div><div className="values-grid"><Value icon={ShieldCheck} title="Trust first" text="Clear details, real organisers and experiences built with care." /><Value icon={Users} title="People powered" text="The best outcomes start with a room full of different perspectives." /><Value icon={Sparkles} title="Always curious" text="We make space for questions, experiments and unexpected interests." /></div></section>;
}
function Value({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) { return <div className="value-card"><Icon size={22} /><h3>{title}</h3><p>{text}</p></div>; }

// ============================================================
// CONTACT
// ============================================================
function ContactPage({ setToast }: { setToast: (value: string) => void }) {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', company: '' });
  return (
    <section className="page-content page-width contact-page">
      <div className="page-intro"><p className="eyebrow"><span className="eyebrow-dot" /> We would love to hear from you</p><h1>Have a question? Start here.</h1><p>Tell us what is on your mind and our team will get back to you soon.</p></div>
      <div className="contact-layout">
        <form className="contact-form" onSubmit={(e) => { e.preventDefault(); if (form.company) return; setSent(true); setToast('Your message has been sent. Thank you for reaching out.'); setForm({ name: '', email: '', subject: '', message: '', company: '' }); }}>
          <input type="text" name="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
          <div className="form-row"><label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label><label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label></div>
          <label>Subject<input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="How can we help?" /></label>
          <label>Message<textarea required rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Write your message here..." /></label>
          <button className="button button-primary" type="submit">{sent ? <><Check size={16} /> Message sent</> : <>Send message <ArrowRight size={16} /></>}</button>
        </form>
        <div className="contact-aside"><div className="contact-card"><Mail size={20} /><div><strong>Email us</strong><span>hello@eventkalam.com</span></div></div><div className="contact-card"><MapPin size={20} /><div><strong>Find us</strong><span>Warangal, Telangana</span></div></div><div className="contact-card"><Clock3 size={20} /><div><strong>Working hours</strong><span>Mon – Fri, 9:00 AM – 6:00 PM</span></div></div></div>
      </div>
    </section>
  );
}

// ============================================================
// LOGIN / SIGNUP
// ============================================================
function LoginPage({ onLogin, go }: { onLogin: (isNewUser?: boolean) => void; go: (view: View) => void }) {
  const [authMode, setAuthMode] = useState<'user' | 'admin'>('user');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleResetPassword = async () => {
    if (!email) { setError('Enter your email address first.'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, redirect_to: window.location.origin }),
      });
      const data = await response.json();
      setLoading(false);
      if (!response.ok || data.error) {
        setError(data.error || 'Could not send reset email.');
        return;
      }
      setResetSent(true);
      setError('');
    } catch {
      setLoading(false);
      setError('Could not send reset email. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      if (mode === 'signup' && authMode === 'user') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name, phone } },
        });
        if (signUpError) throw signUpError;
        if (data.user) {
          onLogin(true);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        onLogin(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      const friendly = msg.includes('Invalid login') || msg.includes('Invalid credentials')
        ? 'Invalid email or password.'
        : msg.includes('already registered') || msg.includes('already been registered')
        ? 'This email is already registered. Try signing in instead.'
        : msg.includes('Database error saving new user')
        ? 'Something went wrong creating your account. Please try again.'
        : msg;
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-page">
      <div className="auth-visual" style={{ backgroundImage: `linear-gradient(180deg, rgba(5,11,31,.08), rgba(5,11,31,.9)), url("${heroImage}")` }}>
        <img src={logo} alt="EventKalam" />
        <div><p className="eyebrow">A better place to begin</p><h1>There is more waiting for you.</h1><p>Keep your events, ideas and new beginnings in one place.</p></div>
      </div>
      <div className="auth-card">
        <div className="auth-card-head">
          <p className="eyebrow">Welcome to EventKalam</p>
          <h2>{authMode === 'admin' ? 'Admin access' : mode === 'login' ? 'Good to see you.' : 'Make a little room.'}</h2>
          <p>{authMode === 'admin' ? 'Sign in to manage events and registrations.' : mode === 'login' ? 'Sign in to keep exploring.' : 'Create your free student account.'}</p>
        </div>
        <div className="auth-mode-switch">
          <button className={authMode === 'user' ? 'active' : ''} onClick={() => { setAuthMode('user'); setMode('login'); setError(''); setResetSent(false); }}>User Login</button>
          <button className={authMode === 'admin' ? 'active' : ''} onClick={() => { setAuthMode('admin'); setMode('login'); setError(''); setResetSent(false); }}><ShieldCheck size={14} /> Admin Login</button>
        </div>
        {authMode === 'user' && (
          <div className="auth-tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setResetSent(false); }}>Sign in</button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setResetSent(false); }}>Create account</button>
          </div>
        )}
        {error && <div className="auth-error"><AlertCircle size={16} /> {error}</div>}
        {resetSent && <div className="auth-success"><Check size={16} /> Password reset email sent. Check your inbox.</div>}
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && authMode === 'user' && <label>Full name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" /></label>}
          <label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          {mode === 'signup' && authMode === 'user' && <label>Phone number<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone number" /></label>}
          <label>Password
            <div className="password-wrap">
              <input required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          {mode === 'login' && authMode === 'user' && (
            <div className="form-options">
              <label className="checkbox"><input type="checkbox" /> Remember me</label>
              <button type="button" onClick={handleResetPassword} disabled={loading}>Forgot password?</button>
            </div>
          )}
          <button className="button button-primary auth-submit" type="submit" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : authMode === 'admin' ? <>Admin sign in <ArrowRight size={16} /></> : mode === 'login' ? <>Sign in <ArrowRight size={16} /></> : <>Create account <ArrowRight size={16} /></>}
          </button>
        </form>
        <p className="auth-note"><ShieldCheck size={15} /> {authMode === 'admin' ? 'Admin access is restricted to authorized accounts.' : 'Your information stays private and secure.'}</p>
      </div>
    </section>
  );
}

// ============================================================
// RESET PASSWORD
// ============================================================
function ResetPasswordPage({ go, setToast }: { go: (view: View) => void; setToast: (value: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message || 'Could not update password. The reset link may have expired.');
      return;
    }
    setSuccess(true);
    setToast('Password updated. You can now sign in with your new password.');
  };

  if (success) {
    return (
      <section className="auth-page">
        <div className="auth-visual" style={{ backgroundImage: `linear-gradient(180deg, rgba(5,11,31,.08), rgba(5,11,31,.9)), url("${heroImage}")` }}>
          <img src={logo} alt="EventKalam" />
          <div><p className="eyebrow">A better place to begin</p><h1>There is more waiting for you.</h1><p>Keep your events, ideas and new beginnings in one place.</p></div>
        </div>
        <div className="auth-card">
          <div className="auth-card-head">
            <p className="eyebrow">Welcome to EventKalam</p>
            <h2>Password updated.</h2>
            <p>Your new password is ready. You can sign in now.</p>
          </div>
          <div className="auth-success" style={{ marginBottom: 16 }}><Check size={16} /> Your password has been updated successfully.</div>
          <button className="button button-primary auth-submit" onClick={() => go('login')}>Sign in <ArrowRight size={16} /></button>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <div className="auth-visual" style={{ backgroundImage: `linear-gradient(180deg, rgba(5,11,31,.08), rgba(5,11,31,.9)), url("${heroImage}")` }}>
        <img src={logo} alt="EventKalam" />
        <div><p className="eyebrow">A better place to begin</p><h1>There is more waiting for you.</h1><p>Keep your events, ideas and new beginnings in one place.</p></div>
      </div>
      <div className="auth-card">
        <div className="auth-card-head">
          <p className="eyebrow">Welcome to EventKalam</p>
          <h2>Set a new password.</h2>
          <p>Choose a strong password to secure your account.</p>
        </div>
        {error && <div className="auth-error"><AlertCircle size={16} /> {error}</div>}
        <form onSubmit={handleSubmit}>
          <label>New Password
            <div className="password-wrap">
              <input required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          <label>Confirm New Password
            <div className="password-wrap">
              <input required type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          <button className="button button-primary auth-submit" type="submit" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : <>Update password <ArrowRight size={16} /></>}
          </button>
        </form>
        <p className="auth-note"><ShieldCheck size={15} /> Your password is securely encrypted and never shared.</p>
      </div>
    </section>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ profile, events, go, onAction, setToast }: {
  profile: UserProfile; events: EventRow[]; go: (view: View) => void; onAction: () => void; setToast: (value: string) => void;
}) {
  const [tab, setTab] = useState<'upcoming' | 'all'>('upcoming');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editPhone, setEditPhone] = useState(profile.phone);
  const [savingProfile, setSavingProfile] = useState(false);

  const myRegistrations = useMemo(() => {
    const regs: { event: EventRow; reg: Registration }[] = [];
    events.forEach((event) => {
      event.registrations.forEach((reg) => {
        if (reg.user_id === profile.user_id && reg.registration_status === 'registered') {
          regs.push({ event, reg });
        }
      });
    });
    return regs;
  }, [events, profile.user_id]);

  const upcomingRegs = myRegistrations.filter((r) => new Date(r.event.date) >= new Date() && r.reg.registration_status !== 'attended');
  const pastRegs = myRegistrations.filter((r) => r.reg.registration_status === 'attended');
  const attendedCount = myRegistrations.filter((r) => r.reg.registration_status === 'attended').length;

  const handleCancelReg = async (eventId: string) => {
    const { data, error } = await supabase.rpc('cancel_registration', { p_event_id: eventId });
    if (error) { setToast(error.message || 'Cancel failed.'); return; }
    const result = data as { success: boolean; error?: string };
    if (!result.success) { setToast(result.error || 'Cancel failed.'); return; }
    setToast('Registration cancelled.');
    onAction();
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.from('users').update({ name: editName, phone: editPhone }).eq('user_id', profile.user_id);
    setSavingProfile(false);
    if (error) { setToast('Could not save profile changes.'); return; }
    setToast('Profile updated.');
    setEditing(false);
    onAction();
  };

  return (
    <section className="page-content page-width dashboard-page">
      <div className="dashboard-head">
        <div>
          <p className="eyebrow"><span className="eyebrow-dot" /> Student dashboard</p>
          <h1>Welcome back, {profile.name.split(' ')[0]}.</h1>
          <p>Here is where your next chapters are taking shape.</p>
        </div>
        <div className="dashboard-avatar">{profile.name.charAt(0).toUpperCase()}</div>
      </div>
      <div className="dashboard-stats">
        <div><span>Total registrations</span><strong>{myRegistrations.length}</strong><small>Keep exploring</small></div>
        <div><span>Upcoming events</span><strong>{upcomingRegs.length}</strong><small>Ready when you are</small></div>
        <div><span>Events attended</span><strong>{attendedCount}</strong><small>Your story so far</small></div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-panel">
          <div className="panel-head">
            <div><p className="eyebrow">Your saved plans</p><h2>My registrations</h2></div>
            <button className="text-button" onClick={() => go('events')}>Find more <ArrowRight size={16} /></button>
          </div>
          <div className="dashboard-tabs">
            <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>Upcoming ({upcomingRegs.length})</button>
            <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All ({myRegistrations.length})</button>
          </div>
          {(tab === 'upcoming' ? upcomingRegs : myRegistrations).length ? (
            (tab === 'upcoming' ? upcomingRegs : myRegistrations).map(({ event, reg }) => (
              <div className="dashboard-event" key={reg.registration_id}>
                <img src={event.image_url || fallbackImages[0]} alt="" />
                <div>
                  <strong>{event.title}</strong>
                  <span><CalendarDays size={14} /> {formatDate(event.date)} <span className="dot-separator" /> <MapPin size={14} /> {event.venue}</span>
                  <span className="reg-id-line">ID: {reg.registration_id.slice(0, 8).toUpperCase()} · {reg.seats} seat(s)</span>
                </div>
                {reg.registration_status === 'attended' ? (
                  <span className="attended-badge"><Check size={14} /> Attended</span>
                ) : new Date(event.date) >= new Date() ? (
                  <button className="button button-danger-sm" onClick={() => handleCancelReg(event.event_id)}>Cancel</button>
                ) : (
                  <span className="registered-badge">Registered</span>
                )}
              </div>
            ))
          ) : (
            <div className="dashboard-empty">
              <LayoutDashboard size={28} />
              <h3>{tab === 'upcoming' ? 'No upcoming events.' : 'No registrations yet.'}</h3>
              <p>Save an event and it will appear here.</p>
              <button className="button button-primary" onClick={() => go('events')}>Explore events <ArrowRight size={16} /></button>
            </div>
          )}
        </div>

        <div className="dashboard-panel side-panel">
          <p className="eyebrow">Your profile</p>
          <h2>{editing ? 'Edit your details' : 'Profile information'}</h2>
          {editing ? (
            <div className="profile-edit-form">
              <label>Name<input value={editName} onChange={(e) => setEditName(e.target.value)} /></label>
              <label>Phone<input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></label>
              <button className="button button-primary" onClick={handleSaveProfile} disabled={savingProfile}>{savingProfile ? <Loader2 size={16} className="spin" /> : 'Save'}</button>
              <button className="button button-ghost" onClick={() => { setEditing(false); setEditName(profile.name); setEditPhone(profile.phone); }}>Cancel</button>
            </div>
          ) : (
            <div className="profile-info">
              <div className="profile-row"><span>Name</span><strong>{profile.name}</strong></div>
              <div className="profile-row"><span>Email</span><strong>{profile.email}</strong></div>
              <div className="profile-row"><span>Phone</span><strong>{profile.phone || 'Not set'}</strong></div>
              <div className="profile-row"><span>Role</span><strong>{profile.role}</strong></div>
              <button className="button button-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Edit profile</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// ADMIN
// ============================================================
function AdminPage({ profile, go, setToast, onAction }: {
  profile: UserProfile; go: (view: View) => void; setToast: (value: string) => void; onAction: () => void;
}) {
  const [adminEvents, setAdminEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [viewingEvent, setViewingEvent] = useState<EventRow | null>(null);

  const loadAdminEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    if (error) { setAdminEvents([]); } else { setAdminEvents((data || []) as EventRow[]); }
    setLoading(false);
  };

  useEffect(() => { loadAdminEvents(); }, []);

  const handleDelete = async (eventId: string) => {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    const { error } = await supabase.from('events').delete().eq('event_id', eventId);
    if (error) { setToast('Could not delete event.'); return; }
    setToast('Event deleted.');
    loadAdminEvents();
    onAction();
  };

  const handleStatusChange = async (eventId: string, status: 'draft' | 'published' | 'cancelled' | 'completed') => {
    const { error } = await supabase.from('events').update({ status }).eq('event_id', eventId);
    if (error) { setToast('Could not update status.'); return; }
    setToast(`Event ${status}.`);
    loadAdminEvents();
    onAction();
  };

  const totalRegistrations = adminEvents.reduce((sum, e) => sum + e.registered_count, 0);
  const publishedCount = adminEvents.filter((e) => e.status === 'published').length;

  return (
    <section className="page-content page-width admin-page">
      <div className="dashboard-head">
        <div>
          <p className="eyebrow"><span className="eyebrow-dot" /> Admin panel</p>
          <h1>Manage events</h1>
          <p>Create, edit and track every event on EventKalam.</p>
        </div>
        <button className="button button-primary" onClick={() => { setEditingEvent(null); setShowForm(true); }}><Plus size={16} /> New event</button>
      </div>
      <div className="dashboard-stats">
        <div><span>Total events</span><strong>{adminEvents.length}</strong><small>{publishedCount} published</small></div>
        <div><span>Total registrations</span><strong>{totalRegistrations}</strong><small>Across all events</small></div>
        <div><span>Published</span><strong>{publishedCount}</strong><small>Live now</small></div>
      </div>

      {showForm && (
        <AdminEventForm
          event={editingEvent}
          userId={profile.user_id}
          onClose={() => { setShowForm(false); setEditingEvent(null); }}
          onSaved={() => { setShowForm(false); setEditingEvent(null); loadAdminEvents(); onAction(); setToast('Event saved.'); }}
          setToast={setToast}
        />
      )}

      {viewingEvent && (
        <AdminRegistrationsModal event={viewingEvent} onClose={() => setViewingEvent(null)} onAction={() => { loadAdminEvents(); onAction(); }} setToast={setToast} />
      )}

      <div className="admin-events-list">
        {loading ? (
          <div className="empty-state"><Loader2 size={28} className="spin" /><h3>Loading events...</h3></div>
        ) : adminEvents.length === 0 ? (
          <div className="empty-state"><CalendarDays size={30} /><h3>No events yet.</h3><p>Create your first event to get started.</p></div>
        ) : (
          adminEvents.map((event) => (
            <div className="admin-event-row" key={event.event_id}>
              <img src={event.image_url || fallbackImages[0]} alt="" />
              <div className="admin-event-info">
                <strong>{event.title}</strong>
                <span>{event.category} · {formatDate(event.date)} · {event.time}</span>
                <span>{event.venue}{event.city ? `, ${event.city}` : ''}</span>
              </div>
              <div className="admin-event-stats">
                <span className={`status-pill ${event.status}`}>{event.status}</span>
                <span>{event.registered_count}/{event.capacity} registered</span>
              </div>
              <div className="admin-event-actions">
                <button className="icon-btn" onClick={() => { setEditingEvent(event); setShowForm(true); }} title="Edit"><Pencil size={15} /></button>
                <button className="icon-btn" onClick={() => setViewingEvent(event)} title="View registrations"><Eye size={15} /></button>
                {event.status === 'published' && <button className="icon-btn" onClick={() => handleStatusChange(event.event_id, 'cancelled')} title="Cancel event"><X size={15} /></button>}
                {event.status === 'cancelled' && <button className="icon-btn" onClick={() => handleStatusChange(event.event_id, 'published')} title="Publish"><Check size={15} /></button>}
                {event.status === 'published' && <button className="icon-btn" onClick={() => handleStatusChange(event.event_id, 'completed')} title="Mark completed"><Check size={15} /></button>}
                <button className="icon-btn danger" onClick={() => handleDelete(event.event_id)} title="Delete"><Trash2 size={15} /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AdminEventForm({ event, userId, onClose, onSaved, setToast }: {
  event: EventRow | null; userId: string; onClose: () => void; onSaved: () => void; setToast: (value: string) => void;
}) {
  const [form, setForm] = useState({
    title: event?.title || '',
    description: event?.description || '',
    category: event?.category || 'Workshop',
    date: event?.date || '',
    time: event?.time || '',
    venue: event?.venue || '',
    city: event?.city || '',
    capacity: event?.capacity || 50,
    price: event?.price || 0,
    image_url: event?.image_url || fallbackImages[0],
    status: event?.status || 'draft',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageOptions = fallbackImages;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setUploadError('Only JPG, PNG, or WEBP images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be smaller than 5 MB.');
      return;
    }
    setUploadError('');
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `events/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('event-images').upload(path, file, { upsert: false });
    if (upErr) {
      setUploadError('Upload failed. Please try again.');
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('event-images').getPublicUrl(path);
    setForm((prev) => ({ ...prev, image_url: urlData.publicUrl }));
    setUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.date || !form.time) { setToast('Title, date and time are required.'); return; }
    setSaving(true);
    const payload = {
      ...form,
      capacity: Number(form.capacity),
      price: Number(form.price),
      created_by: userId,
    };
    if (event) {
      const { error } = await supabase.from('events').update(payload).eq('event_id', event.event_id);
      if (error) { setToast('Could not save event.'); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('events').insert(payload);
      if (error) { setToast('Could not create event.'); setSaving(false); return; }
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{event ? 'Edit event' : 'Create event'}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="admin-form">
          <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" /></label>
          <label>Description<textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Event description" /></label>
          <div className="form-row">
            <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Workshop</option><option>Seminar</option><option>Community</option><option>Career</option><option>Networking</option><option>Cultural</option><option>Hackathon</option>
            </select></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'draft' | 'published' | 'cancelled' | 'completed' })}>
              <option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option>
            </select></label>
          </div>
          <div className="form-row">
            <label>Date<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>Time<input required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="10:00 AM - 1:00 PM" /></label>
          </div>
          <div className="form-row">
            <label>Venue<input required value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Venue name" /></label>
            <label>City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" /></label>
          </div>
          <div className="form-row">
            <label>Capacity<input required type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></label>
            <label>Price (₹)<input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></label>
          </div>
          <label>Event image
            <div className="image-picker">
              {imageOptions.map((img) => (
                <button type="button" key={img} className={form.image_url === img ? 'image-option selected' : 'image-option'} onClick={() => setForm({ ...form, image_url: img })}>
                  <img src={img} alt="" />
                </button>
              ))}
              <button
                type="button"
                className="image-option image-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Upload image from computer"
              >
                {uploading ? <Loader2 size={20} className="spin" /> : <Upload size={20} />}
                <span style={{ fontSize: 10, marginTop: 3 }}>{uploading ? 'Uploading…' : 'Upload'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
              />
            </div>
            {uploadError && <p style={{ color: '#ff5f5f', fontSize: 12, marginTop: 4 }}>{uploadError}</p>}
            {form.image_url && !imageOptions.includes(form.image_url) && (
              <div style={{ marginTop: 8 }}>
                <img src={form.image_url} alt="Preview" style={{ height: 70, width: 100, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--cyan)' }} />
              </div>
            )}
          </label>
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? <Loader2 size={16} className="spin" /> : event ? 'Save changes' : 'Create event'}</button>
        </form>
      </div>
    </div>
  );
}

function AdminRegistrationsModal({ event, onClose, onAction, setToast }: { event: EventRow; onClose: () => void; onAction: () => void; setToast: (value: string) => void }) {
  const [localEvent, setLocalEvent] = useState<EventRow>(event);
  const [updating, setUpdating] = useState<string | null>(null);

  const activeRegs = localEvent.registrations.filter((r) => r.registration_status !== 'cancelled');

  const toggleAttendance = async (reg: Registration) => {
    setUpdating(reg.registration_id);
    const newStatus: 'registered' | 'attended' = reg.registration_status === 'attended' ? 'registered' : 'attended';
    const updatedRegs = localEvent.registrations.map((r) =>
      r.registration_id === reg.registration_id ? { ...r, registration_status: newStatus } : r
    );
    const { error } = await supabase
      .from('events')
      .update({ registrations: updatedRegs })
      .eq('event_id', localEvent.event_id);
    setUpdating(null);
    if (error) { setToast('Could not update attendance.'); return; }
    setLocalEvent({ ...localEvent, registrations: updatedRegs });
    setToast(`Marked as ${newStatus}.`);
    onAction();
  };

  const markAllPresent = async () => {
    const updatedRegs = localEvent.registrations.map((r) =>
      r.registration_status === 'registered' ? { ...r, registration_status: 'attended' as const } : r
    );
    const { error } = await supabase
      .from('events')
      .update({ registrations: updatedRegs })
      .eq('event_id', localEvent.event_id);
    if (error) { setToast('Could not update attendance.'); return; }
    setLocalEvent({ ...localEvent, registrations: updatedRegs });
    setToast('All registered users marked as attended.');
    onAction();
  };

  const attendedCount = activeRegs.filter((r) => r.registration_status === 'attended').length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><h2>Registrations</h2><p>{localEvent.title}</p></div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-stats">
          <span>Total: <strong>{activeRegs.length}</strong></span>
          <span>Capacity: <strong>{localEvent.capacity}</strong></span>
          <span>Available: <strong>{availableSeats(localEvent)}</strong></span>
          <span>Attended: <strong>{attendedCount}</strong></span>
        </div>
        {activeRegs.length > 0 && activeRegs.some((r) => r.registration_status === 'registered') && (
          <button className="button button-ghost" style={{ marginBottom: 12, width: 'fit-content' }} onClick={markAllPresent}>
            <Check size={15} /> Mark all present
          </button>
        )}
        {activeRegs.length === 0 ? (
          <div className="empty-state" style={{ margin: '20px 0' }}><Users size={24} /><h3>No registrations yet.</h3></div>
        ) : (
          <div className="admin-reg-list">
            {activeRegs.map((reg) => (
              <div className="admin-reg-row" key={reg.registration_id}>
                <div className="reg-avatar">{reg.user_name.charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{reg.user_name}</strong>
                  <span>{reg.user_email}</span>
                  <span>{reg.phone || 'No phone'} · {reg.seats} seat(s)</span>
                </div>
                <div className="reg-actions">
                  <span className={`reg-id-tag ${reg.registration_status}`}>{reg.registration_status}</span>
                  <span className="reg-id-tag">{reg.registration_id.slice(0, 8).toUpperCase()}</span>
                  <button
                    className={`button button-sm ${reg.registration_status === 'attended' ? 'button-registered' : 'button-outline'}`}
                    onClick={() => toggleAttendance(reg)}
                    disabled={updating === reg.registration_id}
                  >
                    {updating === reg.registration_id ? <Loader2 size={14} className="spin" /> : reg.registration_status === 'attended' ? <><Check size={14} /> Attended</> : 'Mark attended'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
