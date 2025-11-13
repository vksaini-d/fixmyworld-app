import React, { useState, useEffect, useMemo } from 'react'; // Added useMemo for analytics
// --- Firebase/Firestore Imports ---
// We import the necessary Firebase modules to connect to the database
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, serverTimestamp, query, onSnapshot, 
  doc, updateDoc, increment, arrayUnion // Added imports for Phases 4/5
} from 'firebase/firestore'; 

// NEW CODE:
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// --- Weather API Key (from user) ---

const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY;

// --- Category Definitions ---
// A shared list of categories for the app
const issueCategories = [
  { value: "pothole", label: "Pothole" },
  { value: "garbage-dump", label: "Garbage Dump" },
  { value: "broken-streetlight", label: "Broken Streetlight" },
  { value: "water-leakage", label: "Water Leakage" },
  { value: "drainage-failure", label: "Drainage Failure" },
  { value: "illegal-construction", label: "Illegal Construction" },
  { value: "other", label: "Other" },
];

// --- Font and Style Importer ---
const StyleImporter = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap');
    
    .font-orbitron {
      font-family: 'Orbitron', sans-serif;
    }
    .font-share-tech {
      font-family: 'Share Tech Mono', monospace;
    }
    
    /* Custom Neon Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
    }
    ::-webkit-scrollbar-track {
      background: #000;
    }
    ::-webkit-scrollbar-thumb {
      background: #0ea5e9; /* cyan-500 */
      border-radius: 4px;
      border: 1px solid #000;
      box-shadow: 0 0 5px #0ea5e9;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #ec4899; /* pink-500 */
      box-shadow: 0 0 10px #ec4899;
    }
  `}</style>
);


// --- Main App Component ---
// This now manages navigation, shared Firebase state, and main data fetching
export default function App() {
  const [view, setView] = useState('dashboard'); // Default to dashboard
  const [selectedIssueId, setSelectedIssueId] = useState(null); // For detail view
  
  // --- New state for Weather Effects ---
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(null);

  // --- Firebase State ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [initError, setInitError] = useState(null);
  
  // --- New state for Mobile Menu ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // --- Lifted State (for Phases 3 & 6) ---
  // We now fetch all issues here so Dashboard and Analytics can share them
  const [issues, setIssues] = useState([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [errorIssues, setErrorIssues] = useState(null);
  
  // --- Function to Fetch Weather ---
  const fetchWeather = async (lat, lon) => {
    if (!WEATHER_API_KEY) {
      setWeatherError("Weather API key not set.");
      return;
    }
    setWeatherError(null);
    try {
      const apiUrl = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${lat},${lon}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Weather data not found.');
      }
      const data = await response.json();
      setWeather(data.current);
    } catch (error) {
      console.error("Error fetching weather:", error);
      setWeatherError(error.message);
    }
  };

  // --- Effect to fetch weather on load (Default Location: Churu) ---
  useEffect(() => {
    // Churu, Rajasthan, India
    const defaultLat = 28.2982;
    const defaultLon = 74.9571;
    fetchWeather(defaultLat, defaultLon);
  }, []); // Runs once on app load

  // --- Firebase Initialization Effect ---
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const authInstance = getAuth(app);
      const dbInstance = getFirestore(app);

      setDb(dbInstance);
      setAuth(authInstance);

      onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          try {
            // Note: __initial_auth_token will be undefined in production
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
              await signInWithCustomToken(authInstance, __initial_auth_token);
            } else {
              await signInAnonymously(authInstance);
            }
          } catch (authError) {
            console.error("Error during sign-in:", authError);
            setInitError('Authentication failed. Please refresh.');
          }
        }
      });
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setInitError('Could not connect to services. Please refresh.');
    }
  }, []); // Empty dependency array ensures this runs only once

  // --- All Issues Data Fetching Effect (Lifted from Dashboard) ---
  useEffect(() => {
    // Do not run query until services are ready
    if (!isAuthReady || !db) return;

    setLoadingIssues(true);
    // --- THIS PATH IS NOW CORRECT ---
    const collectionPath = 'issues';
    const issuesQuery = query(collection(db, collectionPath));

    // onSnapshot creates a real-time listener
    const unsubscribe = onSnapshot(issuesQuery, (snapshot) => {
      const issuesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setIssues(issuesData);
      setLoadingIssues(false);
    }, (err) => {
      console.error("Error fetching issues: ", err);
      setErrorIssues("Failed to load issues. Please refresh.");
      setLoadingIssues(false);
    });

    // Cleanup listener on component unmount
    return () => unsubscribe();

  }, [db, appId, isAuthReady]); // Re-run if db, appId, or auth status changes


  const renderView = () => {
    // Show loading or error until auth is ready
    if (initError) {
      return <div className="p-4 text-center text-red-500 font-orbitron">{initError}</div>;
    }
    if (!isAuthReady) {
      return <div className="p-4 text-center text-cyan-400 font-orbitron animate-pulse">Loading Services...</div>;
    }
    
    // Pass shared props to the active view
    const viewProps = { db, auth, userId, isAuthReady, appId, setSelectedIssueId };
    // Pass data props to views that need them
    const dataProps = { issues, loading: loadingIssues, error: errorIssues };

    // --- View logic ---
    // If an issue ID is selected, show the detail view
    if (selectedIssueId) {
      return (
        <IssueDetailView
          {...viewProps}
          issueId={selectedIssueId}
          onBack={() => setSelectedIssueId(null)} // Pass a function to go back
        />
      );
    }

    // Otherwise, show the main tabbed view
    switch (view) {
      case 'report':
        return <ReportIssueView {...viewProps} onLocationFound={fetchWeather} />;
      case 'analytics': // New case for Phase 6
        return <AnalyticsView {...viewProps} {...dataProps} />;
      case 'dashboard':
      default:
        return <MapDashboardView {...viewProps} {...dataProps} />;
    }
  };

  return (
    // Switched to a permanent dark mode with neon background
    <div className="flex min-h-screen w-full font-share-tech text-gray-200 bg-black bg-gradient-to-br from-gray-900 via-black to-blue-900">
      <StyleImporter />
      
      {/* --- New Weather Effects Component --- */}
      <WeatherEffects weather={weather} />
      
      {/* --- New Sidebar Navigation --- */}
      <Sidebar 
        view={view}
        setView={setView}
        selectedIssueId={selectedIssueId}
        setSelectedIssueId={setSelectedIssueId}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />
      
      {/* --- New Mobile Header --- */}
      <MobileHeader 
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* --- Main Content Area (relative, z-0) --- */}
      <div className="flex flex-1 flex-col md:pl-64">
        <main className="flex-grow">
          {renderView()}
        </main>
        
        {/* Weather Info Bar */}
        {weather && (
          <footer className="sticky bottom-0 z-10 bg-black/70 backdrop-blur-sm border-t border-cyan-500/30 p-2 text-center text-xs text-cyan-300">
            <span className="font-orbitron">WEATHER:</span> {weather.condition.text} ({weather.temp_c}°C) | 
            <span className="font-orbitron"> WIND:</span> {weather.wind_kph} kph | 
            <span className="font-orbitron"> HUMIDITY:</span> {weather.humidity}%
            {weatherError && <span className="ml-2 text-red-400">{weatherError}</span>}
          </footer>
        )}
      </div>
    </div>
  );
}

// --- New Mobile Header Component ---
const MobileHeader = ({ setIsMobileMenuOpen }) => (
  <div className="sticky top-0 z-10 flex h-16 flex-shrink-0 items-center justify-between border-b border-cyan-500/30 bg-gray-900/70 backdrop-blur-md md:hidden">
    <div className="pl-4">
      <span className="text-2xl font-orbitron font-extrabold text-cyan-400" style={{textShadow: '0 0 5px #0ea5e9'}}>
        🌍 FixMyWorld
      </span>
    </div>
    <button
      type="button"
      className="px-4 text-cyan-400"
      onClick={() => setIsMobileMenuOpen(true)}
    >
      <span className="sr-only">Open sidebar</span>
      <MenuIcon />
    </button>
  </div>
);

// --- New Sidebar Component ---
const Sidebar = ({ view, setView, selectedIssueId, setSelectedIssueId, isMobileMenuOpen, setIsMobileMenuOpen }) => {
  
  const NavItem = ({ icon, label, viewName }) => {
    const isActive = view === viewName && !selectedIssueId;
    return (
      <button
        onClick={() => {
          setView(viewName);
          setSelectedIssueId(null);
          setIsMobileMenuOpen(false);
        }}
        className={`group flex w-full items-center space-x-3 rounded-lg px-3 py-3 text-base font-semibold transition-all ${
          isActive
            ? 'bg-cyan-500/20 text-cyan-300 shadow-[inset_0_0_10px_rgba(14,165,233,0.5)] border border-cyan-500/50'
            : 'text-gray-400 hover:bg-cyan-500/10 hover:text-cyan-400'
        }`}
      >
        <span className={isActive ? 'text-cyan-300' : 'text-gray-500 group-hover:text-cyan-400'}>
          {icon}
        </span>
        <span>{label}</span>
      </button>
    );
  };
  
  return (
    <>
      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-cyan-500/30 bg-black/70 backdrop-blur-md transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-cyan-500/30 px-4">
          <span className="text-2xl font-orbitron font-extrabold text-cyan-400" style={{textShadow: '0 0 5px #0ea5e9'}}>
            🌍 FixMyWorld
          </span>
          {/* Mobile close button */}
          <button
            type="button"
            className="text-cyan-400 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <span className="sr-only">Close sidebar</span>
            <XIcon />
          </button>
        </div>
        
        {/* Navigation */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          <nav className="flex-1 space-y-2 p-4">
            <NavItem 
              icon={<HomeIcon />} 
              label="Dashboard" 
              viewName="dashboard" 
            />
            <NavItem 
              icon={<AnalyticsIcon />} 
              label="Analytics" 
              viewName="analytics" 
            />
            <NavItem 
              icon={<PlusIcon />} 
              label="Report Issue" 
              viewName="report" 
            />
          </nav>
        </div>
      </div>
    </>
  );
};


// --- New Weather Effects Component ---
const WeatherEffects = ({ weather }) => {
  if (!weather) return null;

  const conditionCode = weather.condition.code;

  // WeatherAPI.com condition codes
  const isRain = (conditionCode >= 1063 && conditionCode <= 1072) || 
                 (conditionCode >= 1150 && conditionCode <= 1201) ||
                 (conditionCode >= 1240 && conditionCode <= 1246);
                 
  const isSnow = (conditionCode >= 1066 && conditionCode <= 1069) ||
                 (conditionCode >= 1114 && conditionCode <= 1117) ||
                 (conditionCode >= 1204 && conditionCode <= 1237) ||
                 (conditionCode >= 1249 && conditionCode <= 1264);
                 
  const isCloudy = (conditionCode >= 1003 && conditionCode <= 1030);
  
  const isThunder = (conditionCode >= 1087 && conditionCode <= 1276); // Covers thunder with rain/snow

  // Generate a set number of drops/flakes for the animation
  const rainDrops = Array.from({ length: 100 }, (_, i) => i);
  const snowFlakes = Array.from({ length: 100 }, (_, i) => i);
  const clouds = Array.from({ length: 5 }, (_, i) => i);
  
  return (
    <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-50 overflow-hidden">
      {/* --- Define animations --- */}
      <style>{`
        @keyframes fall {
          0% { transform: translateY(-10vh); }
          100% { transform: translateY(110vh); }
        }
        @keyframes drift {
          0% { transform: translateX(-20vw); opacity: 0; }
          25% { opacity: 0.7; }
          75% { opacity: 0.7; }
          100% { transform: translateX(120vw); opacity: 0; }
        }
        @keyframes flash {
          0%, 100% { opacity: 0; }
          5% { opacity: 1; }
          7% { opacity: 0; }
          10% { opacity: 0.8; }
          15% { opacity: 0; }
        }
      `}</style>
      
      {/* --- Render Effects --- */}
      {isRain && rainDrops.map(i => {
        const style = {
          left: `${Math.random() * 100}vw`,
          height: `${Math.random() * 1.5 + 0.5}vh`,
          animation: `fall ${Math.random() * 0.5 + 0.5}s linear ${Math.random() * 2}s infinite`,
          opacity: Math.random() * 0.3 + 0.2,
        };
        return <div key={i} className="absolute top-0 w-0.5 bg-cyan-300 shadow-[0_0_5px_theme(colors.cyan.300)]" style={style}></div>;
      })}
      
      {isSnow && snowFlakes.map(i => {
        const duration = Math.random() * 5 + 5; // 5-10 seconds
        const style = {
          left: `${Math.random() * 100}vw`,
          width: `${Math.random() * 4 + 2}px`,
          height: `${Math.random() * 4 + 2}px`,
          animation: `fall ${duration}s linear ${Math.random() * duration}s infinite`,
          opacity: Math.random() * 0.7 + 0.3,
        };
        return <div key={i} className="absolute top-0 bg-white rounded-full shadow-[0_0_10px_theme(colors.white)]" style={style}></div>;
      })}
      
      {isCloudy && !isRain && !isSnow && clouds.map(i => {
         const duration = Math.random() * 50 + 70; // 70-120 seconds
         const style = {
            top: `${Math.random() * 20}vh`, // Top 20% of screen
            width: `${Math.random() * 300 + 400}px`, // 400-700px wide
            height: `${Math.random() * 100 + 100}px`, // 100-200px tall
            animation: `drift ${duration}s linear ${Math.random() * duration}s infinite`,
         };
         return <div key={i} className="absolute bg-gray-500 bg-opacity-10 rounded-full blur-xl" style={style}></div>
      })}
      
      {isThunder && (
        <div 
          className="absolute top-0 left-0 w-full h-full bg-cyan-100"
          style={{ animation: 'flash 4s linear infinite' }}
        ></div>
      )}
      
    </div>
  );
};


// --- Phase 3: Map Dashboard View ---
// Now receives issues as a prop, no internal data fetching
const MapDashboardView = ({ issues, loading, error, setSelectedIssueId }) => {
  const [filterCategory, setFilterCategory] = useState('all');

  // Filter issues based on the selected category
  const filteredIssues = issues.filter(issue => {
    if (filterCategory === 'all') return true;
    return issue.category === filterCategory;
  });

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="flex flex-col md:flex-row md:space-x-4">
        
        {/* --- Sidebar (Filters + List) --- */}
        <div className="w-full md:w-1/3">
          <div className="rounded-xl bg-gray-900/50 backdrop-blur-md border border-cyan-500/30 p-4 shadow-lg">
            <h2 className="mb-4 text-xl font-orbitron text-cyan-400">Filters</h2>
            
            {/* --- Category Filter --- */}
            <label htmlFor="category-filter" className="block text-sm font-semibold text-cyan-300">
              Category
            </label>
            <select
              id="category-filter"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="mt-1 block w-full rounded-md border-cyan-500/50 bg-gray-800 text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm"
            >
              <option value="all">All Categories</option>
              {issueCategories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            
            <hr className="my-6 border-cyan-500/30" />

            {/* --- Issue List --- */}
            <h3 className="mb-4 text-lg font-orbitron text-cyan-400">Reported Issues ({filteredIssues.length})</h3>
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {loading && <p className="text-cyan-400 animate-pulse">Loading issues...</p>}
              {error && <p className="text-red-400">{error}</p>}
              {!loading && filteredIssues.length === 0 && (
                <p className="text-gray-400">No issues found matching this filter.</p>
              )}
              {filteredIssues.map(issue => (
                <IssueCard 
                  key={issue.id} 
                  issue={issue}
                  onClick={() => setSelectedIssueId(issue.id)} // Set the selected issue
                />
              ))}
            </div>
          </div>
        </div>

        {/* --- Map Area --- */}
        <div className="mt-4 h-96 w-full md:mt-0 md:h-auto md:w-2/3">
          <div className="flex h-full w-full items-center justify-center rounded-xl bg-black/50 shadow-lg border border-cyan-500/30">
            <p className="text-xl font-orbitron text-gray-500">
              [INTERACTIVE MAP]
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

// --- Single Issue Card for List ---
const IssueCard = ({ issue, onClick }) => {
  const categoryLabel = issueCategories.find(c => c.value === issue.category)?.label || issue.category;
  
  // Get status color
  let statusColor = 'bg-blue-500/20 text-blue-300 border border-blue-500/30'; // reported
  if (issue.status === 'in-progress') {
    statusColor = 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
  } else if (issue.status === 'resolved') {
    statusColor = 'bg-green-500/20 text-green-300 border border-green-500/30';
  }

  return (
    <div 
      onClick={onClick} // Make the card clickable
      className="cursor-pointer rounded-lg border border-gray-700 bg-gray-800/50 p-3 transition-all hover:bg-gray-800/90 hover:border-pink-500/70"
    >
      <div className="flex justify-between items-center">
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>
          {categoryLabel}
        </span>
        <span className="text-xs font-semibold text-gray-400 flex items-center">
          <ThumbsUpIcon /> {issue.votes || 0}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-300 truncate">{issue.description}</p>
      <p className="mt-1 text-xs text-gray-400">
        Status: <span className="font-medium capitalize">{issue.status}</span>
      </p>
    </div>
  );
};

// --- Phase 4 & 5: Issue Detail View ---
const IssueDetailView = ({ db, appId, userId, issueId, onBack }) => {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Get Issue Doc Path ---
  // --- THIS PATH IS NOW CORRECT ---
  const issueDocPath = `issues/${issueId}`;
  const issueRef = doc(db, issueDocPath);

  // --- Real-time Data Fetching for ONE issue ---
  useEffect(() => {
    setLoading(true);
    // We need to check if issueRef is valid before subscribing
    if (!issueRef) {
        setError("Invalid issue ID.");
        setLoading(false);
        return;
    }
    const unsubscribe = onSnapshot(issueRef, (doc) => {
      if (doc.exists()) {
        setIssue({ id: doc.id, ...doc.data() });
      } else {
        setError("Issue not found.");
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching document: ", err);
      setError("Failed to load issue.");
      setLoading(false);
    });

    // Cleanup listener
    return () => unsubscribe();
  }, [issueRef]); // Rerun if issueRef changes (e.g., new issueId)

  // --- Action Handlers ---

  const handleUpvote = async () => {
    if (!issueRef) return;
    try {
      await updateDoc(issueRef, {
        votes: increment(1) // Atomically increment the vote count
      });
    } catch (e) {
      console.error("Error upvoting: ", e);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!issueRef) return;
    try {
      await updateDoc(issueRef, {
        status: newStatus
      });
    } catch (e) {
      console.error("Error updating status: ", e);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !issueRef) return;
    setIsSubmitting(true);

    const commentData = {
      text: newComment,
      user_id: userId,
      created_at: serverTimestamp()
    };

    try {
      await updateDoc(issueRef, {
        comments: arrayUnion(commentData) // Atomically add to array
      });
      setNewComment(''); // Clear input
    } catch (e) {
      console.error("Error adding comment: ", e);
    }
    setIsSubmitting(false);
  };

  // --- Render Logic ---
  if (loading) return <div className="p-4 text-center text-cyan-400 animate-pulse">Loading issue...</div>;
  if (error) return <div className="p-4 text-center text-red-400">{error}</div>;
  if (!issue) return null;

  const categoryLabel = issueCategories.find(c => c.value === issue.category)?.label || issue.category;
  
  // Format timestamps (if they exist and are loaded)
  const formatTime = (timestamp) => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleString();
    }
    return 'Pending...'; // Firestore timestamps are null until server confirms
  };

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* This is the "popup" style card */}
      <div className="rounded-xl bg-gray-900/70 backdrop-blur-md border border-pink-500/50 p-6 shadow-lg shadow-pink-500/20">
        {/* --- Back Button --- */}
        <button onClick={onBack} className="mb-4 flex items-center text-sm font-semibold text-cyan-400 hover:text-cyan-200">
          <BackIcon />
          Back to Dashboard
        </button>

        {/* --- Header --- */}
        <span className="text-sm font-semibold text-pink-400">{categoryLabel}</span>
        <h1 className="mt-1 text-2xl font-orbitron font-bold text-white">{issue.description}</h1>
        <p className="mt-2 text-sm text-gray-300">
          Reported by user: <code className="text-xs text-gray-400">{issue.reported_by}</code>
        </p>
        <p className="text-sm text-gray-300">
          Date Reported: {formatTime(issue.created_at)}
        </p>

        {/* --- Map Placeholder for Detail --- */}
        <div className="my-4 h-48 w-full rounded-lg bg-black/50 border border-pink-500/30 flex items-center justify-center">
          <p className="text-gray-400 font-orbitron">[Map for Lat: {issue.location?.lat.toFixed(4)}, Lng: {issue.location?.lng.toFixed(4)}]</p>
        </div>

        {/* --- Actions --- */}
        <div className="flex flex-wrap gap-2 border-y border-pink-500/30 py-4">
          <button
            onClick={handleUpvote}
            className="flex items-center gap-1 rounded-full bg-blue-500/20 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/40 border border-blue-500/50"
          >
            <ThumbsUpIcon /> Upvote ({issue.votes || 0})
          </button>
          <button
            onClick={() => handleUpdateStatus('in-progress')}
            disabled={issue.status === 'in-progress'}
            className="rounded-full bg-yellow-500/20 px-4 py-2 text-sm font-semibold text-yellow-300 hover:bg-yellow-500/40 disabled:opacity-50 border border-yellow-500/50"
          >
            Mark In Progress
          </button>
          <button
            onClick={() => handleUpdateStatus('resolved')}
            disabled={issue.status === 'resolved'}
            className="rounded-full bg-green-500/20 px-4 py-2 text-sm font-semibold text-green-300 hover:bg-green-500/40 disabled:opacity-50 border border-green-500/50"
          >
            Mark Resolved
          </button>
        </div>

        {/* --- Comments (Reports) --- */}
        <div className="mt-6">
          <h2 className="text-lg font-orbitron font-bold text-pink-400">Community Reports ({issue.comments?.length || 0})</h2>
          
          {/* --- Add Comment Form --- */}
          <form onSubmit={handleAddComment} className="mt-4 flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add an update or comment..."
              className="flex-grow rounded-md border-gray-700 bg-gray-800 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500 sm:text-sm"
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-pink-500/30 hover:bg-pink-700 disabled:bg-pink-900"
            >
              {isSubmitting ? '...' : 'Post'}
            </button>
          </form>

          {/* --- Comment List --- */}
          <div className="mt-4 max-h-60 space-y-3 overflow-y-auto">
            {issue.comments && issue.comments.length > 0 ? (
              [...issue.comments].reverse().map((comment, index) => ( // Show newest first
                <div key={index} className="rounded-lg bg-gray-800/70 p-3 border border-gray-700">
                  <p className="text-sm text-gray-200">{comment.text}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    By user <code className="text-xs">{comment.user_id.substring(0, 10)}...</code> at {formatTime(comment.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400">No comments yet. Be the first to add one!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- New Phase 6: Analytics View ---
const AnalyticsView = ({ issues, loading, error }) => {
  
  // Calculate analytics using useMemo to prevent re-calculating on every render
  const stats = useMemo(() => {
    const total = issues.length;
    
    const byStatus = issues.reduce((acc, issue) => {
      const status = issue.status || 'reported';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const byCategory = issues.reduce((acc, issue) => {
      const category = issue.category || 'other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    
    // Find max values for scaling bar charts
    const maxStatus = Math.max(1, ...Object.values(byStatus));
    const maxCategory = Math.max(1, ...Object.values(byCategory));

    return {
      total,
      reported: byStatus.reported || 0,
      inProgress: byStatus['in-progress'] || 0,
      resolved: byStatus.resolved || 0,
      byStatus,
      byCategory,
      maxStatus,
      maxCategory
    };
  }, [issues]);

  if (loading) return <div className="p-4 text-center text-cyan-400 animate-pulse">Loading analytics...</div>;
  if (error) return <div className="p-4 text-center text-red-400">{error}</div>;

  return (
    <div className="mx-auto max-w-7xl p-4">
      <h1 className="text-3xl font-orbitron font-extrabold text-white" style={{textShadow: '0 0 10px #0ea5e9'}}>Analytics</h1>
      <p className="mt-1 text-lg text-gray-300">
        A real-time overview of all reported issues.
      </p>

      {/* --- Key Metric Cards --- */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Issues" value={stats.total} icon={<ListIcon />} />
        <StatCard title="Reported" value={stats.reported} icon={<ReportIcon />} color="blue" />
        <StatCard title="In Progress" value={stats.inProgress} icon={<ClockIcon />} color="yellow" />
        <StatCard title="Resolved" value={stats.resolved} icon={<CheckIcon />} color="green" />
      </div>

      {/* --- Charts --- */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* --- Issues by Category --- */}
        <div className="rounded-xl bg-gray-900/50 backdrop-blur-md border border-cyan-500/30 p-6 shadow-lg">
          <h2 className="text-xl font-orbitron text-cyan-400">Issues by Category</h2>
          <div className="mt-4 space-y-3">
            {issueCategories.map(cat => (
              <BarChartRow
                key={cat.value}
                label={cat.label}
                value={stats.byCategory[cat.value] || 0}
                maxValue={stats.maxCategory}
                color="bg-cyan-500"
                shadow="shadow-[0_0_10px_theme(colors.cyan.500)]"
              />
            ))}
          </div>
        </div>
        
        {/* --- Issues by Status --- */}
        <div className="rounded-xl bg-gray-900/50 backdrop-blur-md border border-cyan-500/30 p-6 shadow-lg">
          <h2 className="text-xl font-orbitron text-cyan-400">Issues by Status</h2>
          <div className="mt-4 space-y-3">
            <BarChartRow
              label="Reported"
              value={stats.byStatus.reported || 0}
              maxValue={stats.maxStatus}
              color="bg-blue-500"
              shadow="shadow-[0_0_10px_theme(colors.blue.500)]"
            />
            <BarChartRow
              label="In Progress"
              value={stats.byStatus['in-progress'] || 0}
              maxValue={stats.maxStatus}
              color="bg-yellow-500"
              shadow="shadow-[0_0_10px_theme(colors.yellow.500)]"
            />
            <BarChartRow
              label="Resolved"
              value={stats.byStatus.resolved || 0}
              maxValue={stats.maxStatus}
              color="bg-green-500"
              shadow="shadow-[0_0_10px_theme(colors.green.500)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Stat Card Component (Updated with Icon) ---
const StatCard = ({ title, value, icon, color = 'gray' }) => {
  const colorClasses = {
    gray: { text: 'text-gray-200', iconBg: 'bg-gray-800/50', border: 'border-gray-700' },
    blue: { text: 'text-blue-300', iconBg: 'bg-blue-900/50', border: 'border-blue-500/50' },
    yellow: { text: 'text-yellow-300', iconBg: 'bg-yellow-900/50', border: 'border-yellow-500/50' },
    green: { text: 'text-green-300', iconBg: 'bg-green-900/50', border: 'border-green-500/50' },
  };
  return (
    <div className={`rounded-xl bg-gray-900/50 backdrop-blur-md border ${colorClasses[color].border} p-5 shadow-lg`}>
      <div className="flex items-center space-x-4">
        <div className={`flex-shrink-0 rounded-full p-3 ${colorClasses[color].iconBg}`}>
          <span className={colorClasses[color].text}>{icon}</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-400">{title}</p>
          <p className={`text-3xl font-orbitron font-extrabold ${colorClasses[color].text}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
};

// --- Simple Bar Chart Row Component ---
const BarChartRow = ({ label, value, maxValue, color, shadow }) => {
  const widthPercentage = (value / maxValue) * 100;
  return (
    <div>
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">{value}</span>
      </div>
      <div className="mt-1 h-3 w-full rounded-full bg-black/50 border border-gray-700">
        <div
          className={`h-full rounded-full ${color} ${shadow}`}
          style={{ width: `${widthPercentage}%` }}
        ></div>
      </div>
    </div>
  );
};


// --- Phase 1 & 2: Report Issue View ---
// Now accepts `onLocationFound` prop
const ReportIssueView = ({ db, appId, userId, isAuthReady, onLocationFound }) => {
  // State for form fields
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [location, setLocation] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // --- State for Location Fetching ---
  const [locationStatus, setLocationStatus] = useState({
    loading: false,
    error: null,
  });

  // --- Handler for Image Upload ---
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      // Create a preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setImage(null);
      setImagePreview(null);
    }
  };

  // --- Handler for Location Fetching ---
  const handleGetLocation = () => {
    setLocationStatus({ loading: true, error: null });
    setLocation(null); // Clear previous location

    if (!navigator.geolocation) {
      setLocationStatus({
        loading: false,
        error: 'Geolocation is not supported by your browser.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lng: longitude });
        setLocationStatus({ loading: false, error: null });
        
        // --- Call the new prop to update weather ---
        if (onLocationFound) {
          onLocationFound(latitude, longitude);
        }
      },
      (error) => {
        let errorMsg = 'Unable to retrieve location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location permission denied. Please enable it in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMsg = 'The request to get user location timed out.';
            break;
          default:
            errorMsg = 'An unknown error occurred.';
            break;
        }
        setLocationStatus({ loading: false, error: errorMsg });
      },
      { timeout: 10000 } // 10 second timeout
    );
  };

  // --- Handler for Form Submission (UPDATED) ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    // --- Form Validation ---
    if (!category || !description || !image || !location) {
      setMessage({
        type: 'error',
        text: 'Please fill all fields, upload an image, and get location.',
      });
      setIsSubmitting(false);
      return;
    }

    // --- Auth Validation ---
    if (!isAuthReady || !db || !userId) {
      setMessage({
        type: 'error',
        text: 'Not connected to services. Please wait or refresh.',
      });
      setIsSubmitting(false);
      return;
    }
    
    try {
      // --- Create Issue Document ---
      const issueData = {
        category: category,
        description: description,
        location: location, // Stores { lat, lng }
        status: 'reported', // Default status
        reported_by: userId,
        created_at: serverTimestamp(), // Firestore server-side timestamp
        image_filename: image.name, // Storing filename as placeholder
        votes: 0,
        comments: [],
      };

      // --- Save to Firestore ---
      // --- THIS PATH IS NOW CORRECT ---
      const collectionPath = 'issues';
      const docRef = await addDoc(collection(db, collectionPath), issueData);

      // --- Success ---
      setIsSubmitting(false);
      setMessage({
        type: 'success',
        text: `Issue reported successfully! Tracking ID: ${docRef.id}`,
      });

      // Reset form
      setCategory('');
      setDescription('');
      setImage(null);
      setImagePreview(null);
      setLocation(null);
      setLocationStatus({ loading: false, error: null });

    } catch (error) {
      // --- Error Handling ---
      console.error("Error adding document: ", error);
      setIsSubmitting(false);
      setMessage({
        type: 'error',
        text: 'Failed to submit report. Please try again.',
      });
    }
  };

  return (
    <div className="flex w-full items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl bg-gray-900/70 backdrop-blur-md border border-cyan-500/50 p-6 shadow-xl shadow-cyan-500/20 sm:p-10">
        {/* --- Header --- */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-orbitron font-extrabold text-white sm:text-4xl" style={{textShadow: '0 0 10px #0ea5e9'}}>
            Report an Issue
          </h1>
          <p className="mt-2 text-lg text-gray-300">
            "See it. Report it. Fix it."
          </p>
        </div>

        {/* --- Form --- */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* --- Category --- */}
          <div>
            <label
              htmlFor="category"
              className="block text-sm font-semibold text-cyan-300"
            >
              Issue Category
            </label>
            <select
              id="category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-700 bg-gray-800 text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm"
            >
              <option value="">Select a category...</option>
              {issueCategories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* --- Image Upload --- */}
          <div>
            <label className="block text-sm font-semibold text-cyan-300">
              Upload Photo
            </label>
            <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-cyan-500/50 px-6 pt-5 pb-6">
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Issue preview"
                    className="h-48 w-auto rounded-md object-cover border border-cyan-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImage(null);
                      setImagePreview(null);
                    }}
                    className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full border border-pink-500 bg-gray-900 text-xl font-bold text-pink-500 shadow-sm hover:bg-gray-800"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <div className="space-y-1 text-center">
                  <UploadCloudIcon />
                  <div className="flex text-sm text-gray-400">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md font-medium text-cyan-400 hover:text-cyan-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-cyan-500 focus-within:ring-offset-2 focus-within:ring-offset-gray-900"
                    >
                      <span>Upload a file</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageChange}
                        className="sr-only"
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    PNG, JPG, GIF up to 10MB
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* --- Description --- */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-semibold text-cyan-300"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-700 bg-gray-800 text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm"
              placeholder="Provide more details, like landmarks or severity..."
            ></textarea>
          </div>

          {/* --- Location --- */}
          <div>
            <label className="block text-sm font-semibold text-cyan-300">
              Location
            </label>
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={locationStatus.loading}
              className="mt-1 flex w-full items-center justify-center rounded-md border border-cyan-500/50 bg-gray-800 px-4 py-2 text-sm font-medium text-cyan-300 shadow-sm hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MapPinIcon />
              {locationStatus.loading
                ? 'Getting Location...'
                : 'Get Current Location'}
            </button>
            
            {/* --- Location Status Display --- */}
            {locationStatus.error && (
              <p className="mt-2 text-sm text-red-400">
                {locationStatus.error}
              </p>
            )}
            {location && (
              <p className="mt-2 text-sm text-green-400">
                ✅ Location captured: {location.lat.toFixed(5)},{' '}
                {location.lng.toFixed(5)}
              </p>
            )}
          </div>

          {/* --- Message Display --- */}
          {message && (
            <div
              className={`rounded-md p-4 text-sm border ${
                message.type === 'success'
                  ? 'bg-green-900/50 text-green-300 border-green-500/50'
                  : 'bg-red-900/50 text-red-300 border-red-500/50'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* --- Submit Button --- */}
          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full justify-center rounded-md border border-transparent bg-cyan-600 py-3 px-4 text-lg font-semibold text-black shadow-lg shadow-cyan-500/30 transition-all hover:bg-cyan-500 hover:shadow-xl hover:shadow-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:bg-cyan-900 disabled:shadow-none"
            >
              {isSubmitting ? 'Submitting...' : 'Report Issue Now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


// --- Icon Components (Reskinned for Neon) ---

const MapPinIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mr-2 h-5 w-5"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>
);

const UploadCloudIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mx-auto h-12 w-12 text-cyan-500/70"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" y1="3" x2="12" y2="15"></line>
  </svg>
);

const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const ThumbsUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
    <path d="M7 10v12"></path>
    <path d="M17 10V4a2 2 0 0 0-2-2i-1.12 0a2.03 2.03 0 0 0-1.88.98l-3.3 5.76A.9.9 0 0 0 9 12v9h10a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2z"></path>
  </svg>
);

const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);

const AnalyticsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12"y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
  </svg>
);

const MenuIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const ListIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"></line>
    <line x1="8" y1="12" x2="21" y2="12"></line>
    <line x1="8" y1="18" x2="21" y2="18"></line>
    <line x1="3" y1="6" x2="3.01" y2="6"></line>
    <line x1="3" y1="12" x2="3.01" y2="12"></line>
    <line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);

const ReportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"></path>
  </svg>
);

const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);