import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'; // <-- ADDED FOR LEAFLET MAP
// --- Firebase/Firestore Imports ---\n// We import the necessary Firebase modules to connect to the database
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

// --- Category Definitions ---\n// A shared list of categories for the app
const issueCategories = [
  { value: "pothole", label: "Pothole" },
  { value: "garbage-dump", label: "Garbage Dump" },
  { value: "broken-streetlight", label: "Broken Streetlight" },
  { value: "water-leakage", label: "Water Leakage" },
  { value: "drainage-failure", label: "Drainage Failure" },
  { value: "illegal-construction", label: "Illegal Construction" },
  { value: "other", label: "Other" },
];

// --- Main App Component ---
// This is the root component that manages the entire application's state.
export default function App() {
  // --- State Management ---
  
  // Navigation state
  const [view, setView] = useState('dashboard'); // 'dashboard', 'analytics', 'report', 'detail'
  const [selectedIssueId, setSelectedIssueId] = useState(null); // For detail view
  
  // --- New state for Weather Effects ---
  const [weather, setWeather] = useState(null); // Stores weather data (e.g., 'Rain', 'Clear')
  
  // Firebase state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false); // New state to track auth
  
  // Data state
  const [issues, setIssues] = useState([]); // Stores the list of issues from Firestore
  
  // UI state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- ADDED FOR FIX ---
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;

  // --- Effects ---

  // Effect for Firebase Initialization and Authentication
  useEffect(() => {
    // console.log("Initializing Firebase...");
    try {
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);
      
      setDb(firestoreDb);
      setAuth(firebaseAuth);

      // Use onAuthStateChanged to listen for auth state
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          // User is signed in
          // console.log("User is signed in with UID:", user.uid);
          setUserId(user.uid);
          setIsAuthReady(true); // Auth is ready
        } else {
          // User is signed out, attempt anonymous sign-in
          // console.log("No user found, attempting anonymous sign-in...");
          try {
            const userCredential = await signInAnonymously(firebaseAuth);
            // console.log("Anonymous sign-in successful, UID:", userCredential.user.uid);
            // The onAuthStateChanged listener will catch this new state
          } catch (signInError) {
            console.error("Error during anonymous sign-in:", signInError);
            setIsAuthReady(true); // Auth is ready, even if sign-in failed
          }
        }
      });

      // Cleanup subscription on component unmount
      return () => unsubscribe();
      
    } catch (e) {
      console.error("Error initializing Firebase:", e);
      // If Firebase fails to init, we still say "auth is ready" to not block UI
      setIsAuthReady(true); 
    }
  }, []); // Empty dependency array ensures this runs only once

  // Effect for Firestore Data Fetching
  useEffect(() => {
    // console.log("Setting up Firestore listener... Auth ready:", isAuthReady, "DB set:", !!db);
    
    // IMPORTANT: Only try to fetch data if auth is ready AND db is initialized
    if (!isAuthReady || !db) {
      // console.log("Waiting for auth and DB to be ready...");
      return; 
    }

    // console.log("Auth and DB are ready. Querying Firestore.");
    
    // Path for the 'issues' collection
    const collectionPath = 'issues';
    const issuesCollection = collection(db, collectionPath);
    const q = query(issuesCollection); // We can add sorting/filtering here later

    // onSnapshot creates a real-time listener
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      // console.log("Received Firestore update.");
      const issuesList = [];
      querySnapshot.forEach((doc) => {
        issuesList.push({ id: doc.id, ...doc.data() });
      });
      // console.log("Fetched issues:", issuesList);
      setIssues(issuesList);
    }, (error) => {
      console.error("Error listening to Firestore:", error);
      // Log more details if available
      if (error.code === 'permission-denied') {
        console.error("Firestore Permission Denied. Check your security rules.");
      } else if (error.code === 'unauthenticated') {
         console.error("Firestore Unauthenticated. Auth state is not valid.");
      } else {
         console.error("Firestore error code:", error.code);
      }
    });

    // Cleanup the listener when the component unmounts or dependencies change
    return () => {
      // console.log("Cleaning up Firestore listener.");
      unsubscribe();
    };
  }, [isAuthReady, db]); // Re-run this effect if auth or db state changes

  // Effect for fetching Weather Data
  useEffect(() => {
    // Fetches weather data on component mount
    const fetchWeather = (lat, lon) => {
      const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${lat},${lon}`;
      fetch(url)
        .then(response => response.json())
        .then(data => {
          setWeather({
            condition: data.current.condition.text,
            temp_c: data.current.temp_c,
            wind_kph: data.current.wind_kph,
            humidity: data.current.humidity,
          });
        })
        .catch(error => console.error("Error fetching weather:", error));
    };

    // Try to get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchWeather(position.coords.latitude, position.coords.longitude);
        },
        () => {
          // Fallback location (e.g., a default city) if user denies permission
          fetchWeather(28.6139, 77.2090); // Default to Delhi
        }
      );
    } else {
      // Geolocation not supported, use fallback
      fetchWeather(28.6139, 77.2090);
    }
  }, []); // Runs once on mount
  
  // --- Event Handlers ---

  const handleViewChange = (newView) => {
    setView(newView);
    setIsMobileMenuOpen(false); // Close menu on navigation
  };

  const handleViewDetails = (issueId) => {
    setSelectedIssueId(issueId);
    setView('detail');
    setIsMobileMenuOpen(false);
  };

  const handleBack = () => {
    setView('dashboard');
    setSelectedIssueId(null);
  };

  // --- Helper Functions ---

  // Gets a color class based on category
  const getCategoryClass = (category) => {
    switch (category) {
      case 'pothole': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'garbage-dump': return 'bg-green-500/20 text-green-300 border border-green-500/30';
      case 'broken-streetlight': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
      case 'water-leakage': return 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
      case 'drainage-failure': return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
      case 'illegal-construction': return 'bg-red-500/20 text-red-300 border border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
    }
  };

  // --- Memoized Data ---
  
  // Filter state for the dashboard
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Memoized list of filtered issues
  const filteredIssues = useMemo(() => {
    if (categoryFilter === 'all') {
      return issues;
    }
    return issues.filter(issue => issue.category === categoryFilter);
  }, [issues, categoryFilter]);
  
  // Memoized data for the analytics view
  const analyticsData = useMemo(() => {
    const total = issues.length;
    const reported = issues.filter(i => i.status === 'reported').length;
    const inProgress = issues.filter(i => i.status === 'in-progress').length;
    const resolved = issues.filter(i => i.status === 'resolved').length;
    
    const byCategory = issueCategories.reduce((acc, category) => {
      acc[category.value] = issues.filter(i => i.category === category.value).length;
      return acc;
    }, {});

    return { total, reported, inProgress, resolved, byCategory };
  }, [issues]);

  // --- Render Logic ---

  if (!isAuthReady) {
    // Optional: Show a full-screen loader while waiting for auth
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-black">
        <span className="text-2xl font-orbitron text-cyan-400">Loading Secure Session...</span>
      </div>
    );
  }

  // Find the selected issue (if any)
  const selectedIssue = issues.find(issue => issue.id === selectedIssueId);

  return (
    <div className="flex min-h-screen w-full font-share-tech text-gray-200 bg-black bg-gradient-to-br from-gray-900 via-black to-blue-900">
      <GlobalStyles />
      <WeatherEffects weatherCondition={weather?.condition} />
      
      {/* --- Sidebar (Desktop) --- */}
      <Sidebar 
        userId={userId} 
        view={view} 
        setView={handleViewChange} 
        selectedIssueId={selectedIssueId} 
        setSelectedIssueId={setSelectedIssueId}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* --- Mobile Header --- */}
      <MobileHeader 
        isMobileMenuOpen={isMobileMenuOpen} 
        setIsMobileMenuOpen={setIsMobileMenuOpen} 
      />

      {/* --- Main Content Area --- */}
      <div className="flex flex-1 flex-col md:pl-64">
        <main className="flex-grow">
          <div className="mx-auto max-w-7xl p-4">
            {/* --- View Switching Logic --- */}
            {(() => {
              switch (view) {
                case 'dashboard':
                  return <MapDashboardView 
                            view={view}
                            issues={issues} 
                            handleViewDetails={handleViewDetails}
                            categoryFilter={categoryFilter}
                            setCategoryFilter={setCategoryFilter}
                            getCategoryClass={getCategoryClass}
                            filteredIssues={filteredIssues}
                         />;
                case 'analytics':
                  return <AnalyticsView data={analyticsData} />;
                case 'report':
                  return <ReportIssueView 
                            db={db} 
                            userId={userId} 
                            appId={appId}
                            onIssueReported={() => setView('dashboard')} 
                         />;
                case 'detail':
                  return <IssueDetailView 
                            issue={selectedIssue} 
                            handleBack={handleBack} 
                            getCategoryClass={getCategoryClass}
                            db={db}
                            userId={userId}
                         />;
                default:
                  return <MapDashboardView 
                            view={view}
                            issues={issues} 
                            handleViewDetails={handleViewDetails} 
                            categoryFilter={categoryFilter}
                            setCategoryFilter={setCategoryFilter}
                            getCategoryClass={getCategoryClass}
                            filteredIssues={filteredIssues}
                         />;
              }
            })()}
          </div>
        </main>
        
        {/* --- Footer --- */}
        <Footer weather={weather} />
      </div>
    </div>
  );
}


// --- Sub-Components ---
// Breaking the UI into smaller components makes it easier to manage.

/**
 * Sidebar Component
 * Handles desktop navigation and mobile menu logic.
 */
const Sidebar = ({ userId, view, setView, selectedIssueId, setSelectedIssueId, isMobileMenuOpen, setIsMobileMenuOpen }) => {
  
  const handleNav = (newView) => {
    if (newView === 'detail' && selectedIssueId) {
      setView('detail');
    } else {
      setSelectedIssueId(null); // Clear selected issue if navigating away
      setView(newView);
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <div className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-cyan-500/30 bg-black/70 backdrop-blur-md transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Header */}
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-cyan-500/30 px-4">
        <span className="text-2xl font-orbitron font-extrabold text-cyan-400" style={{ textShadow: '0 0 5px #0ea5e9' }}>
          🌍 FixMyWorld
        </span>
        <button type="button" className="text-cyan-400 md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <span className="sr-only">Close sidebar</span>
          <XIcon />
        </button>
      </div>
      
      {/* Navigation */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-2 p-4">
          <NavItem 
            label="Dashboard" 
            icon={<HomeIcon />} 
            isActive={view === 'dashboard' || view === 'detail'} 
            onClick={() => handleNav('dashboard')} 
          />
          <NavItem 
            label="Analytics" 
            icon={<ChartIcon />} 
            isActive={view === 'analytics'} 
            onClick={() => handleNav('analytics')} 
          />
          <NavItem 
            label="Report Issue" 
            icon={<PlusIcon />} 
            isActive={view === 'report'} 
            onClick={() => handleNav('report')} 
          />
        </nav>
      </div>

      {/* --- ADDED USERNAME BLOCK --- */}
      {userId && (
        <div className="border-t border-cyan-500/30 p-4">
          <p className="text-xs text-gray-400">Welcome, User:</p>
          <p className="text-xs text-cyan-300 truncate font-share-tech">{userId}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Mobile Header Component
 */
const MobileHeader = ({ isMobileMenuOpen, setIsMobileMenuOpen }) => (
  <div className="sticky top-0 z-10 flex h-16 flex-shrink-0 items-center justify-between border-b border-cyan-500/30 bg-gray-900/70 backdrop-blur-md md:hidden">
    <div className="pl-4">
      <span className="text-2xl font-orbitron font-extrabold text-cyan-400" style={{ textShadow: '0 0 5px #0ea5e9' }}>
        🌍 FixMyWorld
      </span>
    </div>
    <button type="button" className="px-4 text-cyan-400" onClick={() => setIsMobileMenuOpen(true)}>
      <span className="sr-only">Open sidebar</span>
      <MenuIcon />
    </button>
  </div>
);

/**
 * Navigation Item Component
 */
const NavItem = ({ label, icon, isActive, onClick }) => (
  <button 
    onClick={onClick}
    className={`group flex w-full items-center space-x-3 rounded-lg px-3 py-3 text-base font-semibold transition-all duration-300 hover:scale-105 hover:bg-cyan-500/20 ${
      isActive 
        ? 'bg-cyan-500/20 text-cyan-300 shadow-[inset_0_0_10px_rgba(14,165,233,0.5)] border border-cyan-500/50' 
        : 'text-gray-400 hover:bg-cyan-500/10 hover:text-cyan-400'
    }`}
  >
    <span className={isActive ? 'text-cyan-300' : 'text-gray-500 group-hover:text-cyan-400'}>
      {React.cloneElement(icon, { width: 20, height: 20 })}
    </span>
    <span>{label}</span>
  </button>
);


/**
 * Dashboard View Component
 * Shows the filterable list of issues and the interactive map.
 */
const MapDashboardView = ({ view, issues, handleViewDetails, categoryFilter, setCategoryFilter, getCategoryClass, filteredIssues }) => {
  // Leaflet map default center
  const mapCenter = [28.02319, 75.70063];

  // This state is to force the map to re-render after the modal closes
  // It's a known quirk with Leaflet in modals or tabs
  const [mapId, setMapId] = useState(Date.now());

  useEffect(() => {
    // When the view changes back to 'dashboard', reset the mapId to force re-render
    if (view === 'dashboard') {
      // Use a timeout to ensure the container is visible first
      setTimeout(() => setMapId(Date.now()), 0);
    }
  }, [view]);

  return (
    <div className="flex flex-col md:flex-row md:space-x-4">
      {/* Sidebar with issue list */}
      <div className="w-full md:w-1/3">
        <div className="rounded-xl bg-gray-900/70 backdrop-blur-md p-4 shadow-lg neon-border-animated">
          <h2 className="mb-4 text-xl font-orbitron text-cyan-400">Filters</h2>
          <label htmlFor="category-filter" className="block text-sm font-semibold text-cyan-300">Category</label>
          <select 
            id="category-filter" 
            className="mt-1 block w-full rounded-md border-cyan-500/50 bg-gray-800 text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="pothole">Pothole</option>
            <option value="garbage-dump">Garbage Dump</option>
            <option value="broken-streetlight">Broken Streetlight</option>
            <option value="water-leakage">Water Leakage</option>
            <option value="drainage-failure">Drainage Failure</option>
            <option value="illegal-construction">Illegal Construction</option>
            <option value="other">Other</option>
          </select>

          <hr className="my-6 border-cyan-500/30" />
          
          <h3 className="mb-4 text-lg font-orbitron text-cyan-400">Reported Issues ({filteredIssues.length})</h3>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {filteredIssues.map(issue => (
              <div 
                key={issue.id} 
                className="cursor-pointer rounded-lg border border-gray-700 bg-gray-800/50 p-3 transition-all hover:bg-gray-800/90 hover:border-pink-500/70"
                onClick={() => handleViewDetails(issue.id)}
              >
                <div className="flex justify-between items-center">
                  <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${getCategoryClass(issue.category)}`}>{issue.category}</span>
                  <span className="text-xs font-semibold text-gray-400 flex items-center">
                    <VoteIcon /> {issue.votes}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-300 truncate">Location captured: {issue.location.latitude.toFixed(5)}, {issue.location.longitude.toFixed(5)}</p>
                <p className="mt-1 text-xs text-gray-400">Status: <span className="font-medium capitalize">{issue.status}</span></p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Map */}
      <div className="mt-4 h-96 w-full md:mt-0 md:h-auto md:w-2/3">
        <div className="flex h-full w-full items-center justify-center rounded-xl bg-black/50 shadow-lg border border-cyan-500/30 overflow-hidden neon-border-animated">
          {view === 'dashboard' && (
            <MapContainer key={mapId} center={mapCenter} zoom={13} scrollWheelZoom={true} style={{ height: '100%', width: '100%', zIndex: 0 }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                className="bg-gray-800"
              />
              {filteredIssues.map(issue => (
                <Marker key={issue.id} position={[issue.location.latitude, issue.location.longitude]}>
                  <Popup>
                    <div> {/* Popups inherit from custom.css */}
                      <h3 className="font-orbitron text-base">{issue.category.charAt(0).toUpperCase() + issue.category.slice(1)}</h3>
                      <p>{issue.description.substring(0, 50)}...</p>
                      <p>Status: {issue.status}</p>
                      <p>Votes: {issue.votes}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>
      </div>
    </div>
  );
};


/**
 * Analytics View Component
 * Shows charts and stats about the reported issues.
 */
const AnalyticsView = ({ data }) => {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-orbitron font-bold text-cyan-300" style={{ textShadow: '0 0 8px #0ea5e9' }}>
        Analytics
      </h1>
      <p className="text-lg text-gray-400">A real-time overview of all reported issues.</p>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Issues" value={data.total} icon={<ListIcon />} />
        <StatCard title="Reported" value={data.reported} icon={<ReportIcon />} />
        <StatCard title="In Progress" value={data.inProgress} icon={<ClockIcon />} />
        <StatCard title="Resolved" value={data.resolved} icon={<CheckIcon />} />
      </div>

      {/* Issues by Category */}
      <div className="rounded-xl bg-gray-900/70 backdrop-blur-md p-6 shadow-lg neon-border-animated">
        <h2 className="mb-4 text-2xl font-orbitron text-cyan-400">Issues by Category</h2>
        <div className="space-y-4">
          {Object.entries(data.byCategory).map(([category, count]) => (
            <div key={category}>
              <div className="flex justify-between mb-1">
                <span className="text-base font-medium text-cyan-300 capitalize">{category}</span>
                <span className="text-sm font-medium text-cyan-300">{count}</span>
              </div>
              <div className="w-full bg-gray-700/50 rounded-full h-2.5">
                <div 
                  className="bg-gradient-to-r from-cyan-500 to-pink-500 h-2.5 rounded-full shadow-[0_0_8px_#ec4899]" 
                  style={{ width: `${(count / data.total) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Stat Card Component (for Analytics)
 */
const StatCard = ({ title, value, icon }) => (
  <div className="rounded-xl bg-gray-900/70 backdrop-blur-md p-6 shadow-lg neon-border-animated">
    <div className="flex items-center space-x-4">
      <div className="flex-shrink-0">
        <span className="text-cyan-400 bg-cyan-900/50 p-3 rounded-full shadow-inner">
          {React.cloneElement(icon, { width: 28, height: 28 })}
        </span>
      </div>
      <div>
        <dt className="text-sm font-medium text-gray-400 truncate">{title}</dt>
        <dd className="mt-1 text-3xl font-orbitron font-semibold text-cyan-300">{value}</dd>
      </div>
    </div>
  </div>
);


/**
 * Report Issue View Component
 * The form for submitting a new issue.
 */
const ReportIssueView = ({ db, userId, appId, onIssueReported }) => {
  // Form state
  const [category, setCategory] = useState('pothole');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(null);
  const [image, setImage] = useState(null); // Will store the file object
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(''); // For success messages
  const [isModalOpen, setIsModalOpen] = useState(false); // Modal state

  // Get user's location
  const getLocation = () => {
    setMessage('');
    setError('');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setMessage('Location captured successfully!');
        },
        () => {
          setError('Could not get location. Please enable GPS and allow permission.');
        }
      );
    } else {
      setError('Geolocation is not supported by your browser.');
    }
  };

  // Handle file input
  const handleImageChange = (e) => {
    setMessage('');
    if (e.target.files && e.target.files[0]) {
      // TODO: Add file size/type validation here
      setImage(e.target.files[0]);
      setMessage('Image selected: ' + e.target.files[0].name);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Reset UI state
    setIsSubmitting(true);
    setError('');
    setMessage('');

    // --- Validation ---
    if (!description) {
      setError('Description is required.');
      setIsSubmitting(false);
      return;
    }
    if (!location) {
      setError('Location is required. Please use the "Get Location" button.');
      setIsSubmitting(false);
      return;
    }
    if (!image) {
      setError('An image is required.');
      setIsSubmitting(false);
      return;
    }
    if (!db || !userId) {
      setError('Database connection not ready. Please wait and try again.');
      setIsSubmitting(false);
      return;
    }

    // --- Show Confirmation Modal ---
    setIsModalOpen(true);
  };
  
  // --- Confirmed Submit (from Modal) ---
  const handleConfirmSubmit = async () => {
    setIsModalOpen(false);
    setIsSubmitting(true);
    
    try {
      // --- 1. Image Upload (Phase 3) ---
      // This is a placeholder. We are not implementing the actual image upload yet.
      // In a real app, this would involve 'firebase/storage'
      // For now, we'll just save a placeholder URL.
      const imageUrl = 'https://placehold.co/600x400/cyan/black?text=Issue+Image';
      
      // --- 2. Save Data to Firestore ---
      const issueData = {
        category,
        description,
        location,
        imageUrl,
        status: 'reported',
        votes: 0,
        createdAt: serverTimestamp(),
        reportedBy: userId,
        appId: appId, // Store the appId
        comments: [], // Initialize empty comments array
      };

      // Path for the 'issues' collection
      const collectionPath = 'issues';
      
      const docRef = await addDoc(collection(db, collectionPath), issueData);
      
      // --- 3. Success ---
      setMessage(`Issue reported successfully! (ID: ${docRef.id})`);
      setIsSubmitting(false);
      
      // Reset form
      setCategory('pothole');
      setDescription('');
      setLocation(null);
      setImage(null);
      document.getElementById('image-upload').value = null; // Clear file input
      
      // Optional: Navigate back to dashboard after a delay
      setTimeout(() => {
        onIssueReported();
      }, 2000);

    } catch (e) {
      console.error("Error adding document: ", e);
      setError('An error occurred while submitting the issue. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleCancelSubmit = () => {
    setIsModalOpen(false);
    setIsSubmitting(false);
    setMessage(''); // Clear any messages
  };


  return (
    <>
      <div className="flex justify-center">
        <div className="w-full max-w-2xl rounded-xl bg-gray-900/70 backdrop-blur-md p-6 shadow-xl shadow-cyan-500/20 sm:p-10 neon-border-animated">
          <h1 className="text-4xl font-orbitron font-bold text-cyan-300 mb-6 text-center" style={{ textShadow: '0 0 8px #0ea5e9' }}>
            Report New Issue
          </h1>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-lg font-semibold text-cyan-300 mb-2">
                1. Select Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="block w-full rounded-md border-cyan-500/50 bg-gray-800 text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-lg p-3"
              >
                {issueCategories.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            
            {/* Location */}
            <div>
              <label className="block text-lg font-semibold text-cyan-300 mb-2">
                2. Get Location
              </label>
              <button
                type="button"
                onClick={getLocation}
                className="w-full flex items-center justify-center space-x-2 rounded-md bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-cyan-500/30 transition-all duration-300 hover:scale-105 hover:shadow-cyan-500/50"
              >
                <LocationIcon />
                <span>{location ? 'Recapture Location' : 'Get Current Location'}</span>
              </button>
              {location && (
                <p className="mt-2 text-sm text-green-400">
                  Location captured: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </p>
              )}
            </div>
            
            {/* Image */}
            <div>
              <label htmlFor="image-upload" className="block text-lg font-semibold text-cyan-300 mb-2">
                3. Upload Image
              </label>
              <input
                type="file"
                id="image-upload"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-cyan-900/50 file:text-cyan-300 hover:file:bg-cyan-900/80 file:cursor-pointer"
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-lg font-semibold text-cyan-300 mb-2">
                4. Describe the Issue
              </label>
              <textarea
                id="description"
                rows="4"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., 'Large pothole on the corner of Main St and 2nd Ave, very dangerous...'"
                className="block w-full rounded-md border-cyan-500/50 bg-gray-800 text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-base p-3"
              ></textarea>
            </div>
            
            {/* Messages */}
            {error && <p className="text-center text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-md">{error}</p>}
            {message && <p className="text-center text-green-400 bg-green-900/50 border border-green-500/50 p-3 rounded-md">{message}</p>}

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center space-x-2 rounded-md bg-gradient-to-r from-cyan-500 to-pink-500 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-pink-500/30 transition-all duration-300 hover:scale-105 hover:shadow-pink-500/60 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <SpinnerIcon />
                ) : (
                  <ReportIcon />
                )}
                <span>{isSubmitting ? 'Submitting...' : 'Report Issue Now'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {/* --- Confirmation Modal --- */}
      <Modal 
        isOpen={isModalOpen}
        onClose={handleCancelSubmit}
        onConfirm={handleConfirmSubmit}
        title="Confirm Submission"
      >
        <p className="text-gray-300">
          Are you sure you want to report this issue?
        </p>
        <div className="mt-4 bg-gray-800 border border-gray-700 p-3 rounded-md text-sm space-y-1">
          <p><span className="font-semibold text-gray-400">Category:</span> {category}</p>
          <p><span className="font-semibold text-gray-400">Location:</span> {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'N/A'}</p>
          <p><span className="font-semibold text-gray-400">Image:</span> {image ? image.name : 'N/A'}</p>
        </div>
      </Modal>
    </>
  );
};


/**
 * Issue Detail View Component
 * Shows detailed information about a single issue.
 */
const IssueDetailView = ({ issue, handleBack, getCategoryClass, db, userId }) => {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  if (!issue) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold text-red-400">Issue not found</h2>
        <button
          onClick={handleBack}
          className="mt-4 flex items-center justify-center space-x-2 rounded-md bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-base font-semibold text-white shadow-lg shadow-cyan-500/30 transition-all duration-300 hover:scale-105 hover:shadow-cyan-500/50"
        >
          <ChevronLeftIcon />
          <span>Back to Dashboard</span>
        </button>
      </div>
    );
  }

  // --- Handle Upvote ---
  const handleUpvote = async () => {
    if (!db || !userId) return;

    // Check if user has already voted
    if (issue.votedBy && issue.votedBy.includes(userId)) {
      console.log("User has already voted.");
      // Optional: Show a message to the user
      return;
    }
    
    const issueRef = doc(db, 'issues', issue.id);
    try {
      await updateDoc(issueRef, {
        votes: increment(1),
        votedBy: arrayUnion(userId) // Add user's ID to the 'votedBy' array
      });
      console.log("Vote successful!");
    } catch (e) {
      console.error("Error upvoting:", e);
    }
  };

  // --- Handle Comment Submit ---
  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!db || !userId || !comment.trim()) return;
    
    setIsSubmitting(true);
    
    const newComment = {
      id: crypto.randomUUID(), // Simple unique ID for the comment
      userId: userId,
      text: comment,
      createdAt: serverTimestamp(), // Use server timestamp
    };

    const issueRef = doc(db, 'issues', issue.id);
    try {
      await updateDoc(issueRef, {
        comments: arrayUnion(newComment)
      });
      setComment(''); // Clear input
    } catch (e) {
      console.error("Error adding comment:", e);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // --- Handle Status Update ---
  const handleStatusUpdate = async (newStatus) => {
    if (!db) return;
    const issueRef = doc(db, 'issues', issue.id);
    try {
      await updateDoc(issueRef, {
        status: newStatus
      });
      console.log("Status updated!");
    } catch (e) {
      console.error("Error updating status:", e);
    }
  };

  // Check if the current user has already voted
  const hasVoted = issue.votedBy && issue.votedBy.includes(userId);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={handleBack}
        className="mb-4 flex items-center space-x-2 text-cyan-400 hover:text-cyan-200 transition-all"
      >
        <ChevronLeftIcon />
        <span>Back to Dashboard</span>
      </button>

      <div className="rounded-xl bg-gray-900/70 backdrop-blur-md border border-cyan-500/50 shadow-xl shadow-cyan-500/20 overflow-hidden">
        {/* Image Header */}
        <div className="h-64 w-full bg-gray-800">
          <img 
            src={issue.imageUrl} 
            alt={issue.category} 
            className="w-full h-full object-cover" 
            onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/600x400/cyan/black?text=Image+Not+Available'; }}
          />
        </div>
        
        <div className="p-6 sm:p-8">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <span className={`inline-block rounded-full px-4 py-1 text-sm font-semibold ${getCategoryClass(issue.category)}`}>
              {issue.category}
            </span>
            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <ReportIcon width={16} height={16} />
              <span>Reported by: {issue.reportedBy ? `${issue.reportedBy.substring(0, 6)}...` : 'Anonymous'}</span>
              <span className="text-gray-600">|</span>
              <ClockIcon width={16} height={16} />
              <span>{issue.createdAt ? new Date(issue.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>
            </div>
          </div>
          
          {/* Title/Description */}
          <h1 className="mt-4 text-3xl font-orbitron font-bold text-cyan-300">
            Issue: {issue.description.substring(0, 30)}...
          </h1>
          <p className="mt-2 text-lg text-gray-300">
            {issue.description}
          </p>
          
          {/* Details Grid */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-b border-cyan-500/30 py-6">
            {/* Status */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Status</h3>
              <p className="text-xl font-semibold text-cyan-300 capitalize">{issue.status}</p>
              
              {/* --- Admin Status Controls --- */}
              {/* In a real app, you'd check if(user.isAdmin) */}
              <div className="flex space-x-2 mt-2">
                 <button 
                   onClick={() => handleStatusUpdate('reported')}
                   className={`px-2 py-0.5 text-xs rounded-full ${issue.status === 'reported' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'}`}
                 >
                   Reported
                 </button>
                 <button 
                   onClick={() => handleStatusUpdate('in-progress')}
                   className={`px-2 py-0.5 text-xs rounded-full ${issue.status === 'in-progress' ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-300'}`}
                 >
                   In Progress
                 </button>
                 <button 
                   onClick={() => handleStatusUpdate('resolved')}
                   className={`px-2 py-0.5 text-xs rounded-full ${issue.status === 'resolved' ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'}`}
                 >
                   Resolved
                 </button>
              </div>
            </div>
            {/* Location */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Location</h3>
              <p className="text-xl font-semibold text-cyan-300">
                {issue.location.latitude.toFixed(5)}, {issue.location.longitude.toFixed(5)}
              </p>
              <a 
                href={`https://www.google.com/maps?q=${issue.location.latitude},${issue.location.longitude}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center space-x-1 text-sm text-blue-400 hover:text-blue-300"
              >
                <span>View on Google Maps</span>
                <ExternalLinkIcon />
              </a>
            </div>
            {/* Votes */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Votes</h3>
              <p className="text-3xl font-orbitron font-bold text-cyan-300">{issue.votes}</p>
              <button
                onClick={handleUpvote}
                disabled={hasVoted}
                className="mt-2 w-full flex items-center justify-center space-x-2 rounded-md bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-base font-semibold text-white shadow-lg shadow-cyan-500/30 transition-all duration-300 hover:scale-105 hover:shadow-cyan-500/50 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
              >
                <VoteIcon />
                <span>{hasVoted ? 'Voted' : 'Upvote'}</span>
              </button>
            </div>
          </div>
          
          {/* Comments Section */}
          <div className="mt-6">
            <h2 className="text-2xl font-orbitron text-cyan-400 mb-4">Comments ({issue.comments.length})</h2>
            
            {/* New Comment Form */}
            <form onSubmit={handleCommentSubmit} className="flex space-x-3">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a public comment..."
                className="flex-1 rounded-md border-cyan-500/50 bg-gray-800 text-white shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-base p-3"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-gradient-to-r from-cyan-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-500/30 transition-all duration-300 hover:scale-105 disabled:opacity-50"
              >
                {isSubmitting ? <SpinnerIcon /> : 'Post'}
              </button>
            </form>
            
            {/* Comments List */}
            <div className="mt-6 space-y-4 max-h-60 overflow-y-auto">
              {issue.comments.length > 0 ? (
                [...issue.comments].reverse().map(c => ( // Show newest first
                  <div key={c.id} className="flex space-x-3 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                    <div className="flex-shrink-0 bg-cyan-900/50 text-cyan-300 rounded-full h-10 w-10 flex items-center justify-center text-xs font-bold">
                      {c.userId.substring(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-cyan-300">
                        {c.userId.substring(0, 8)}...
                        <span className="text-xs text-gray-400 font-normal ml-2">
                          {c.createdAt ? new Date(c.createdAt.seconds * 1000).toLocaleString() : 'Just now'}
                        </span>
                      </div>
                      <p className="text-gray-300">{c.text}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">Be the first to comment.</p>
              )}
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
};


/**
 * Global Styles Component
 * Injects global styles like fonts and scrollbars.
 */
const GlobalStyles = () => (
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

/**
 * Weather Effects Component
 * Renders animated weather effects based on the weather condition.
 */
const WeatherEffects = ({ weatherCondition }) => {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!weatherCondition) return;

    let particleCount = 0;
    let particleStyle = {};
    let animationDuration = '10s';

    if (weatherCondition.includes('Rain')) {
      particleCount = 50;
      particleStyle = {
        width: '1px',
        height: '15px',
        background: 'rgba(173, 216, 230, 0.5)', // Light blue
        animationName: 'fall',
        animationTimingFunction: 'linear',
      };
      animationDuration = `${Math.random() * 2 + 1}s`; // Faster fall
    } else if (weatherCondition.includes('Snow')) {
      particleCount = 50;
      particleStyle = {
        width: '5px',
        height: '5px',
        background: 'rgba(255, 255, 255, 0.7)',
        borderRadius: '50%',
        animationName: 'fall',
        animationTimingFunction: 'ease-in-out',
      };
      animationDuration = `${Math.random() * 10 + 5}s`; // Slower fall
    } else if (weatherCondition.includes('Clear') || weatherCondition.includes('Sunny')) {
       particleCount = 10; // Few shining stars
       particleStyle = {
         width: '2px',
         height: '2px',
         background: 'rgba(255, 255, 200, 0.8)',
         borderRadius: '50%',
         boxShadow: '0 0 5px rgba(255, 255, 200, 1)',
         animationName: 'flash',
         animationTimingFunction: 'ease-in-out',
       };
       animationDuration = `${Math.random() * 5 + 5}s`;
    }

    const newParticles = [];
    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: i,
        style: {
          ...particleStyle,
          left: `${Math.random() * 100}vw`,
          animationDuration: animationDuration,
          animationDelay: `${Math.random() * 10}s`,
          animationIterationCount: 'infinite',
          position: 'absolute',
          top: '-20px',
        },
      });
    }
    setParticles(newParticles);

  }, [weatherCondition]);

  return (
    <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-50 overflow-hidden">
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
      {particles.map(p => (
        <div key={p.id} style={p.style}></div>
      ))}
    </div>
  );
};


/**
 * Footer Component
 * Shows the live weather data.
 */
const Footer = ({ weather }) => {
  if (!weather) {
    return (
      <footer className="sticky bottom-0 z-10 bg-black/70 backdrop-blur-sm border-t border-cyan-500/30 p-2 text-center text-xs text-cyan-300">
        Loading weather data...
      </footer>
    );
  }
  
  return (
    <footer className="sticky bottom-0 z-10 bg-black/70 backdrop-blur-sm border-t border-cyan-500/30 p-2 text-center text-xs text-cyan-300">
      <span className="font-orbitron">WEATHER:</span> {weather.condition} ({weather.temp_c}°C) | 
      <span className="font-orbitron"> WIND:</span> {weather.wind_kph} kph | 
      <span className="font-orbitron"> HUMIDITY:</span> {weather.humidity}%
    </footer>
  );
};

/**
 * Modal Component
 * A reusable modal dialog for confirmations.
 */
const Modal = ({ isOpen, onClose, onConfirm, title, children }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="rounded-xl bg-gray-900 shadow-lg shadow-cyan-500/30 w-full max-w-md m-4 neon-border-animated"
        onClick={(e) => e.stopPropagation()} // Prevent click inside from closing
      >
        <div className="flex justify-between items-center p-4 border-b border-cyan-500/30">
          <h2 className="text-2xl font-orbitron text-cyan-400">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
        <div className="flex justify-end space-x-3 p-4 bg-black/50 rounded-b-xl border-t border-cyan-500/30">
          <button
            onClick={onClose}
            className="rounded-md bg-gray-700/50 px-4 py-2 text-sm font-semibold text-gray-300 transition-all hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-gradient-to-r from-cyan-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-pink-500/30 transition-all hover:scale-105"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};


// --- Icon Components ---
// SVG icons used throughout the app.

const SpinnerIcon = () => (
  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const HomeIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);

const ChartIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
  </svg>
);

const PlusIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
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

const ListIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="8" y1="6" x2="21" y2="6"></line>
    <line x1="8" y1="12" x2="21" y2="12"></line>
    <line x1="8" y1="18" x2="21" y2="18"></line>
    <line x1="3" y1="6" x2="3.01" y2="6"></line>
    <line x1="3" y1="12" x2="3.01" y2="12"></line>
    <line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);

const ReportIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
);

const ClockIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const CheckIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const VoteIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1" {...props}>
    <path d="M7 10v12"></path>
    <path d="M17 10V4a2 2 0 0 0-2-2h-1.12a2.03 2.03 0 0 0-1.88.98l-3.3 5.76A.9.9 0 0 0 9 12v9h10a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2z"></path>
  </svg>
);

const LocationIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>
);

const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);

const ChevronLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const ExternalLinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15 3 21 3 21 9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>
);