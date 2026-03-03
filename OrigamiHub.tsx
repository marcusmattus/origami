import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  signOut, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  setDoc,
  Timestamp,
  limit,
  getDocs,
  where,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { GoogleGenAI, Type } from "@google/genai";


// --- IMPORTANT ---
// The Firebase configuration below has been updated with the credentials you provided.
// Your app should now be able to connect to your Firebase project.
// --- --- --- --- ---
const firebaseConfig = {
  apiKey: "AIzaSyALM5xulPu3Ect4iepX4W3Iw79w3UltAZM",
  authDomain: "origamihub-3cc74.firebaseapp.com",
  projectId: "origamihub-3cc74",
  storageBucket: "origamihub-3cc74.appspot.com",
  messagingSenderId: "942107373881",
  appId: "1:942107373881:web:4f73d56ead26b2aa9138e8",
  measurementId: "G-G15Q6215NY"
};


// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const geminiApiKey = process.env.API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;


// --- TYPE DEFINITIONS & CONSTANTS ---
type View = 'feed' | 'tutorials' | 'myplan';

const difficultyMap: { [key: number]: string } = {
    1: 'Beginner',
    2: 'Easy',
    3: 'Intermediate',
    4: 'Advanced',
    5: 'Expert'
};

const categories: string[] = ['Animals', 'Geometric', 'Wearables', 'Modular', 'Holidays', 'Practical', 'Plants'];

interface Comment {
  userId: string;
  text: string;
  timestamp: number;
}

interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

interface Post {
  id: string;
  title: string;
  description: string;
  media: MediaItem[];
  userId: string;
  origamiTaps: string[];
  comments: Comment[];
  timestamp: Timestamp;
  aiScore: number;
}

interface Tutorial {
  id: string;
  title: string;
  difficulty: string;
  difficultyScore: number;
  steps: string[];
  authorId: string;
  category: string;
}

type PlanStatus = 'To Try' | 'In Progress' | 'Completed';

interface PlanItem {
  tutorialId: string;
  status: PlanStatus;
  addedDate: number;
}

interface UserPlan {
  items: PlanItem[];
}

// --- HELPER & VIEW COMPONENTS ---

const formatTime = (timeInSeconds: number) => {
    const seconds = Math.floor(timeInSeconds % 60);
    const minutes = Math.floor(timeInSeconds / 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};


const MediaCarousel: React.FC<{ media: MediaItem[] }> = ({ media }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Video player state
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const currentItem = media[currentIndex];

    // Reset video state when the slide changes
    useEffect(() => {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.pause();
        }
    }, [currentIndex]);

    if (!media || media.length === 0) return null;

    const goToPrevious = () => {
        const isFirstSlide = currentIndex === 0;
        const newIndex = isFirstSlide ? media.length - 1 : currentIndex - 1;
        setCurrentIndex(newIndex);
    };

    const goToNext = () => {
        const isLastSlide = currentIndex === media.length - 1;
        const newIndex = isLastSlide ? 0 : currentIndex + 1;
        setCurrentIndex(newIndex);
    };

    const togglePlayPause = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!videoRef.current) return;
        const newTime = (parseFloat(e.target.value) / 100) * duration;
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!videoRef.current) return;
        const newVolume = parseFloat(e.target.value);
        videoRef.current.volume = newVolume;
        setVolume(newVolume);
        if (newVolume > 0) {
            setIsMuted(false);
            videoRef.current.muted = false;
        }
    };
    
    const toggleMute = () => {
        if (!videoRef.current) return;
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
        if (!isMuted && volume === 0) {
           setVolume(1);
           videoRef.current.volume = 1;
        }
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        setCurrentTime(videoRef.current.currentTime);
        setProgress((videoRef.current.currentTime / duration) * 100);
    };

    const handleMetadataLoaded = () => {
        if (!videoRef.current) return;
        setDuration(videoRef.current.duration);
    };

    const VolumeIcon = () => {
        if (isMuted || volume === 0) return <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m-4 0l4 4" /></svg>;
        if (volume < 0.5) return <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM14 9v6" /></svg>;
        return <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M20 4a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>;
    };

    return (
        <div className="relative w-full h-80 object-cover rounded-lg mb-4 bg-black group">
             {currentItem.type === 'video' ? (
                <video 
                    ref={videoRef}
                    src={currentItem.url} 
                    className="w-full h-full object-contain rounded-lg"
                    onClick={togglePlayPause}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleMetadataLoaded}
                    onEnded={() => setIsPlaying(false)}
                >
                    Your browser does not support the video tag.
                </video>
            ) : (
                <img src={currentItem.url} alt={`media content ${currentIndex + 1}`} className="w-full h-full object-contain rounded-lg" />
            )}

            {currentItem.type === 'video' && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {!isPlaying && (
                        <button onClick={togglePlayPause} className="bg-black/50 text-white rounded-full p-4 pointer-events-auto">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                        </button>
                    )}
                </div>
            )}
            
            {currentItem.type === 'video' && (
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-3 text-white">
                        <button onClick={togglePlayPause}>
                             {isPlaying ? 
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg> : 
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                            }
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={progress || 0}
                            onChange={handleSeek}
                            className="w-full h-1 accent-primary cursor-pointer"
                        />
                         <div className="flex items-center gap-2">
                             <button onClick={toggleMute}><VolumeIcon /></button>
                             <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className="w-20 h-1 accent-primary cursor-pointer"
                             />
                        </div>
                        <span className="text-sm font-mono whitespace-nowrap">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    </div>
                </div>
            )}
            
            {media.length > 1 && (
                <>
                    <button onClick={goToPrevious} className="absolute top-1/2 left-2 transform -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/75 transition-colors z-10">
                        &#10094;
                    </button>
                    <button onClick={goToNext} className="absolute top-1/2 right-2 transform -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/75 transition-colors z-10">
                        &#10095;
                    </button>
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded-full z-10">
                        {currentIndex + 1} / {media.length}
                    </div>
                </>
            )}
        </div>
    );
};

const AuthModal: React.FC<{onClose: () => void}> = ({onClose}) => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            if(isLoginView) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            onClose();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            onClose();
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
            <div className="bg-card-bg rounded-xl shadow-2xl p-8 w-full max-w-md m-4" onClick={e => e.stopPropagation()}>
                <h2 className="text-3xl font-bold text-center mb-2 text-text-main">{isLoginView ? 'Welcome Back' : 'Create Account'}</h2>
                <p className="text-center text-text-secondary mb-6">{isLoginView ? 'Log in to continue your journey.' : 'Join the OrigamiHub community.'}</p>
                
                {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</p>}
                
                <form onSubmit={handleEmailAuth} className="space-y-4">
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email Address" required className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none" />
                    <button type="submit" className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                        {isLoginView ? 'Log In' : 'Sign Up'}
                    </button>
                </form>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-card-bg text-text-secondary">OR</span>
                    </div>
                </div>

                <button onClick={handleGoogleSignIn} className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-text-main font-semibold py-3 px-4 rounded-lg shadow-sm transition-colors">
                   <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C39.99,36.502,44,30.852,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>
                    Continue with Google
                </button>

                <p className="text-center text-sm text-text-secondary mt-6">
                    {isLoginView ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={() => setIsLoginView(!isLoginView)} className="font-semibold text-primary hover:underline ml-1">
                        {isLoginView ? 'Sign Up' : 'Log In'}
                    </button>
                </p>
            </div>
        </div>
    );
};

const Header: React.FC<{
  currentView: View;
  setView: (view: View) => void;
  user: User | null;
  handleAuth: () => void;
}> = ({ currentView, setView, user, handleAuth }) => {
  const navItems: { id: View; label: string }[] = [
    { id: 'feed', label: 'Feed' },
    { id: 'tutorials', label: 'Tutorials' },
    { id: 'myplan', label: 'My Plan' },
  ];

  const getLinkClass = (view: View) => 
    `pb-1 cursor-pointer transition-colors duration-200 ${
      currentView === view
        ? 'text-primary border-b-2 border-primary font-bold'
        : 'text-text-secondary hover:text-primary'
    }`;

  return (
    <header className="sticky top-0 z-50 bg-card-bg/80 backdrop-blur-md shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <h1 className="text-2xl font-bold text-primary cursor-pointer" onClick={() => setView('feed')}>
            OrigamiHub 🪁
          </h1>
          <nav className="hidden md:flex items-center space-x-8">
            {navItems.map(item => (
              <a key={item.id} onClick={() => setView(item.id)} className={getLinkClass(item.id)}>
                {item.label}
              </a>
            ))}
          </nav>
          <button onClick={handleAuth} className="bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
            {user ? 'Log out' : 'Log in / Sign up'}
          </button>
        </div>
        <nav className="md:hidden flex items-center justify-around py-2 border-t border-slate-200">
            {navItems.map(item => (
              <a key={item.id} onClick={() => setView(item.id)} className={getLinkClass(item.id)}>
                {item.label}
              </a>
            ))}
        </nav>
      </div>
    </header>
  );
};

const FeedView: React.FC<{ user: User | null; onViewProfile: (userId: string) => void; onAuthRequest: () => void; }> = ({ user, onViewProfile, onAuthRequest }) => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const [filePreviews, setFilePreviews] = useState<{ url: string; type: 'image' | 'video' }[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
    const [aiScoreRange, setAiScoreRange] = useState({ min: 1, max: 10 });

    useEffect(() => {
        const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const postsData: Post[] = [];
            querySnapshot.forEach((doc) => {
                postsData.push({ id: doc.id, ...doc.data() } as Post);
            });
            setPosts(postsData);
        });
        return () => unsubscribe();
    }, []);
    
    useEffect(() => {
        // Cleanup object URLs when component unmounts
        return () => {
            filePreviews.forEach(preview => URL.revokeObjectURL(preview.url));
        };
    }, [filePreviews]);

    const filteredPosts = useMemo(() => {
        return posts.filter(post => post.aiScore >= aiScoreRange.min && post.aiScore <= aiScoreRange.max);
    }, [posts, aiScoreRange]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            if (mediaFiles.length + files.length > 5) {
                alert("You can upload a maximum of 5 files.");
                return;
            }
            
            setMediaFiles(prev => [...prev, ...files]);

// Fix: Explicitly type 'file' as File to prevent potential type inference issues that cause the reported TypeScript errors.
            const newPreviews = files.map((file: File) => {
                const type = file.type.startsWith('video/') ? 'video' : 'image';
                return { url: URL.createObjectURL(file), type };
            });
            setFilePreviews(prev => [...prev, ...newPreviews]);
        }
    };
    
    const handleRemovePreview = (indexToRemove: number) => {
        URL.revokeObjectURL(filePreviews[indexToRemove].url);
        setMediaFiles(prev => prev.filter((_, index) => index !== indexToRemove));
        setFilePreviews(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handlePostSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            onAuthRequest();
            return;
        }
        if (!title.trim() || !description.trim() || mediaFiles.length === 0) {
            alert("Please fill out all fields and select at least one image or video.");
            return;
        }
        
        setIsUploading(true);
        try {
            const uploadPromises = mediaFiles.map(async (file) => {
                const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(storageRef);
                const type = file.type.startsWith('video/') ? 'video' : 'image';
                return { url: downloadURL, type };
            });

            const uploadedMedia: MediaItem[] = await Promise.all(uploadPromises);

            await addDoc(collection(db, "posts"), {
                title,
                description,
                media: uploadedMedia,
                userId: user.uid,
                origamiTaps: [],
                comments: [],
                timestamp: Timestamp.now(),
                aiScore: Math.floor(Math.random() * 5) + 5,
            });
            
            setTitle('');
            setDescription('');
            setMediaFiles([]);
            filePreviews.forEach(p => URL.revokeObjectURL(p.url));
            setFilePreviews([]);
            const fileInput = document.getElementById('file-input') as HTMLInputElement;
            if (fileInput) fileInput.value = '';

        } catch (error) {
            console.error("Error uploading post: ", error);
            alert("Failed to upload post. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleTapToggle = async (postId: string, taps: string[]) => {
        if (!user) { onAuthRequest(); return; }
        const postRef = doc(db, "posts", postId);
        if (taps.includes(user.uid)) {
            await updateDoc(postRef, { origamiTaps: arrayRemove(user.uid) });
        } else {
            await updateDoc(postRef, { origamiTaps: arrayUnion(user.uid) });
        }
    };
    
    const handleCommentSubmit = async (postId: string) => {
        if (!user) { onAuthRequest(); return; }
        const text = commentInputs[postId]?.trim();
        if (!text) return;

        const postRef = doc(db, "posts", postId);
        await updateDoc(postRef, {
            comments: arrayUnion({
                userId: user.uid,
                text,
                timestamp: Date.now()
            })
        });
        setCommentInputs(prev => ({...prev, [postId]: ''}));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                {posts.length === 0 && <p className="text-center text-text-secondary mt-8">No posts yet. Be the first to share!</p>}
                {posts.length > 0 && filteredPosts.length === 0 && <p className="text-center text-text-secondary mt-8">No posts match the current filter criteria.</p>}
                {filteredPosts.map(post => (
                    <div key={post.id} className="bg-card-bg rounded-xl shadow-lg p-6 mb-6 overflow-hidden">
                        <MediaCarousel media={post.media} />
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="text-2xl font-bold text-text-main">{post.title}</h3>
                                <p className="text-sm text-text-secondary">
                                    by{' '}
                                    <span 
                                        onClick={() => onViewProfile(post.userId)}
                                        className="font-semibold cursor-pointer hover:underline text-primary/90 transition-colors"
                                        title={`View profile of user ${post.userId.substring(0, 6)}...`}
                                        aria-label={`View profile of user ${post.userId.substring(0, 6)}...`}
                                    >
                                        user {post.userId.substring(0, 6)}...
                                    </span>
                                </p>
                            </div>
                            <div className="text-center bg-primary/10 text-primary p-2 rounded-lg">
                                <p className="font-bold text-xl">{post.aiScore}/10</p>
                                <p className="text-xs font-semibold">AI RATING</p>
                            </div>
                        </div>
                        <p className="text-text-secondary mb-4">{post.description}</p>
                        
                        <div className="flex items-center space-x-4 mb-4">
                            <button onClick={() => handleTapToggle(post.id, post.origamiTaps)} className="flex items-center space-x-2 text-text-secondary hover:text-primary transition-colors">
                                <span className={`text-2xl transition-transform transform ${user && post.origamiTaps.includes(user.uid) ? 'scale-125' : ''}`}>&#129704;</span>
                                <span className="font-semibold">{post.origamiTaps.length}</span>
                            </button>
                        </div>

                        {/* Comments Section */}
                        <div className="border-t border-slate-200 pt-4">
                            <h4 className="font-bold mb-2">Comments ({post.comments.length})</h4>
                            <div className="space-y-3 max-h-48 overflow-y-auto pr-2 mb-2">
                                {post.comments.sort((a,b) => a.timestamp - b.timestamp).map((comment, index) => (
                                    <div key={index} className="bg-light-bg p-2 rounded-md">
                                        <p className="text-sm"><strong>{comment.userId.substring(0, 6)}:</strong> {comment.text}</p>
                                    </div>
                                ))}
                            </div>
                            {user ? (
                                <div className="flex space-x-2">
                                    <input 
                                        type="text" 
                                        placeholder="Add a comment..." 
                                        value={commentInputs[post.id] || ''}
                                        onChange={e => setCommentInputs(prev => ({...prev, [post.id]: e.target.value}))}
                                        className="w-full text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                                    />
                                    <button onClick={() => handleCommentSubmit(post.id)} className="bg-primary hover:bg-primary-hover text-white px-3 rounded-lg text-sm font-semibold">Post</button>
                                </div>
                            ) : (
                                <div className="text-center p-2 bg-slate-100 rounded-lg">
                                    <button onClick={onAuthRequest} className="text-sm font-semibold text-primary hover:underline">Log in to comment</button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className="lg:col-span-1">
                <div className="sticky top-24 space-y-6">
                    <div className="bg-card-bg rounded-xl shadow-lg p-6">
                        <h3 className="text-xl font-bold mb-4 text-text-main">Filters</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="min-score-filter" className="font-semibold text-text-secondary block mb-2 flex justify-between">
                                    <span>Minimum AI Score</span>
                                    <span className="font-bold text-primary text-lg">{aiScoreRange.min}</span>
                                </label>
                                <input 
                                    id="min-score-filter"
                                    type="range" 
                                    min="1" 
                                    max="10" 
                                    value={aiScoreRange.min}
                                    onChange={e => {
                                        const newMin = parseInt(e.target.value);
                                        if (newMin <= aiScoreRange.max) {
                                            setAiScoreRange(prev => ({ ...prev, min: newMin }));
                                        }
                                    }}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                            </div>
                            <div>
                                <label htmlFor="max-score-filter" className="font-semibold text-text-secondary block mb-2 flex justify-between">
                                    <span>Maximum AI Score</span>
                                    <span className="font-bold text-primary text-lg">{aiScoreRange.max}</span>
                                </label>
                                <input 
                                    id="max-score-filter"
                                    type="range" 
                                    min="1" 
                                    max="10" 
                                    value={aiScoreRange.max}
                                    onChange={e => {
                                        const newMax = parseInt(e.target.value);
                                        if (newMax >= aiScoreRange.min) {
                                            setAiScoreRange(prev => ({ ...prev, max: newMax }));
                                        }
                                    }}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                            </div>
                        </div>
                    </div>
                    {user ? (
                        <div className="bg-card-bg rounded-xl shadow-lg p-6">
                            <h3 className="text-xl font-bold mb-4 text-text-main">Share Your Art</h3>
                            <form onSubmit={handlePostSubmit} className="space-y-4">
                                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" required className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none" />
                                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" required className="w-full p-3 border border-slate-300 rounded-lg h-24 resize-none focus:ring-2 focus:ring-primary/50 outline-none"></textarea>
                                <div>
                                    <label htmlFor="file-input" className="w-full text-sm p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none flex items-center justify-center cursor-pointer hover:bg-slate-50">
                                        {mediaFiles.length > 0 ? `${mediaFiles.length} file(s) selected` : "Select up to 5 files"}
                                    </label>
                                    <input id="file-input" type="file" accept="image/*,video/*" onChange={handleFileChange} className="hidden" multiple />
                                </div>
                                {filePreviews.length > 0 && (
                                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                                        {filePreviews.map((preview, index) => (
                                            <div key={index} className="relative aspect-square">
                                                {preview.type === 'video' ? (
                                                    <video src={preview.url} muted autoPlay loop className="w-full h-full object-cover rounded-lg bg-black" />
                                                ) : (
                                                    <img src={preview.url} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemovePreview(index)}
                                                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold hover:bg-black/80 transition-colors"
                                                    aria-label="Remove file"
                                                >
                                                    &times;
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-text-secondary">AI score will be assigned randomly.</p>
                                <button type="submit" disabled={isUploading} className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 disabled:bg-slate-400 disabled:cursor-not-allowed">
                                    {isUploading ? 'Uploading...' : 'Post'}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="bg-card-bg rounded-xl shadow-lg p-8 text-center">
                            <h3 className="text-xl font-bold mb-2 text-text-main">Join the Fold!</h3>
                            <p className="text-text-secondary mb-4">Log in or sign up to share your own origami creations with the community.</p>
                            <button onClick={onAuthRequest} className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                                Log in / Sign up
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TutorialsView: React.FC<{ user: User | null; onAuthRequest: () => void; }> = ({ user, onAuthRequest }) => {
    const [tutorials, setTutorials] = useState<Tutorial[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [difficultyFilter, setDifficultyFilter] = useState('All');
    const [categoryFilter, setCategoryFilter] = useState('All');
    
    // AI Form state
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiSuggestedDifficulty, setAiSuggestedDifficulty] = useState(1);
    
    // Manual Form state
    const [title, setTitle] = useState('');
    const [difficulty, setDifficulty] = useState('Beginner');
    const [difficultyScore, setDifficultyScore] = useState(1);
    const [category, setCategory] = useState(categories[0]);
    const [steps, setSteps] = useState('');

    useEffect(() => {
        const q = query(collection(db, "tutorials"), orderBy("difficultyScore"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const tutorialsData: Tutorial[] = [];
            querySnapshot.forEach((doc) => {
                tutorialsData.push({ id: doc.id, ...doc.data() } as Tutorial);
            });
            setTutorials(tutorialsData);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        setDifficulty(difficultyMap[difficultyScore]);
    }, [difficultyScore]);

    const filteredTutorials = useMemo(() => {
        return tutorials.filter(tutorial => {
            const matchesDifficulty = difficultyFilter === 'All' || tutorial.difficulty === difficultyFilter;
            const matchesSearch = tutorial.title.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = categoryFilter === 'All' || tutorial.category === categoryFilter;
            return matchesDifficulty && matchesSearch && matchesCategory;
        });
    }, [tutorials, searchTerm, difficultyFilter, categoryFilter]);
    
    const handleGenerateTutorial = async () => {
        if(!user) { onAuthRequest(); return; }
        if (!aiPrompt.trim()) {
            alert("Please enter what you want to make.");
            return;
        }
        if (!ai) {
            alert("AI tutorial generation is unavailable. Set GEMINI_API_KEY and reload.");
            return;
        }
        setIsGenerating(true);
        try {
            const prompt = `You are an expert origami instructor. Your knowledge is based on common origami models and techniques, like those on origami.guide.
Generate a tutorial for creating a '${aiPrompt}'.
The difficulty should be appropriate for a '${difficultyMap[aiSuggestedDifficulty]}' level.
Provide the response as a JSON object that strictly follows this schema:
{
  "title": "string",
  "difficulty": "string (matching the suggested difficulty, e.g., 'Beginner')",
  "difficultyScore": "integer (a number from 1 to 5 corresponding to the difficulty)",
  "category": "string (one of the following: ${categories.join(', ')})",
  "steps": ["an array of strings, where each string is one step"]
}`;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            difficulty: { type: Type.STRING },
                            difficultyScore: { type: Type.INTEGER },
                            category: { type: Type.STRING },
                            steps: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        }
                    }
                }
            });
            
            const result = JSON.parse(response.text);
            
            setTitle(result.title || aiPrompt);
            setDifficultyScore(result.difficultyScore || aiSuggestedDifficulty);
            setSteps(result.steps.join('\n'));
            if (categories.includes(result.category)) {
                setCategory(result.category);
            }

            alert("AI tutorial has been generated and populated in the form below. Review and submit!");

        } catch (error) {
            console.error("Error generating tutorial:", error);
            alert("Sorry, the AI failed to generate the tutorial. Please try a different prompt.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAddToPlan = async (tutorialId: string) => {
        if (!user) { onAuthRequest(); return; }
        const planRef = doc(db, "plans", user.uid);
        const newPlanItem: PlanItem = {
            tutorialId,
            status: 'To Try',
            addedDate: Date.now()
        };
        await setDoc(planRef, {
            items: arrayUnion(newPlanItem)
        }, { merge: true });
        alert("Added to your plan!");
    };
    
    const handleTutorialSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!user) { onAuthRequest(); return; }
        
        if (!title.trim()) {
            alert("Please provide a title for your tutorial.");
            return;
        }

        const stepsArray = steps.split('\n').filter(step => step.trim() !== '');
        if (stepsArray.length === 0) {
            alert("Please provide at least one step for the tutorial. Each step should be on a new line.");
            return;
        }

        if (difficultyScore < 1 || difficultyScore > 5) {
            alert("Difficulty score must be between 1 and 5.");
            return;
        }

        await addDoc(collection(db, 'tutorials'), {
            title: title.trim(),
            difficulty,
            difficultyScore,
            steps: stepsArray,
            authorId: user.uid,
            category,
        });

        setTitle('');
        setDifficultyScore(1);
        setSteps('');
        setAiPrompt('');
        setCategory(categories[0]);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <div className="bg-card-bg rounded-xl shadow p-4 mb-6 flex flex-col sm:flex-row gap-4 flex-wrap">
                    <input 
                        type="text" 
                        placeholder="Search tutorials..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-grow p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none min-w-[150px]"
                    />
                     <select 
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full sm:w-auto p-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-primary/50 outline-none"
                    >
                        <option value="All">All Categories</option>
                        {categories.map(d => <option key={d}>{d}</option>)}
                    </select>
                    <select 
                        value={difficultyFilter}
                        onChange={(e) => setDifficultyFilter(e.target.value)}
                        className="w-full sm:w-auto p-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-primary/50 outline-none"
                    >
                        <option value="All">All Difficulties</option>
                        {Object.values(difficultyMap).map(d => <option key={d}>{d}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredTutorials.length === 0 && <p className="text-center text-text-secondary mt-8 md:col-span-2">No tutorials found matching your criteria.</p>}
                    {filteredTutorials.map(tutorial => (
                        <div key={tutorial.id} className="bg-card-bg rounded-xl shadow-lg p-6 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="text-xl font-bold text-text-main pr-2">{tutorial.title}</h3>
                                    <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-1 rounded-full whitespace-nowrap">{tutorial.category || 'General'}</span>
                                </div>
                                <p className="text-text-secondary mb-2">{tutorial.difficulty}</p>
                                <div className="flex items-center mb-4">
                                    <span className="text-sm text-text-secondary mr-2">Difficulty:</span>
                                    {'⭐'.repeat(tutorial.difficultyScore).padEnd(5, '☆')}
                                    <span className="ml-1 text-sm font-bold text-text-secondary">/5</span>
                                </div>
                                <p className="text-sm text-text-secondary mb-2">Steps: {tutorial.steps.length}</p>
                            </div>
                             <button onClick={() => handleAddToPlan(tutorial.id)} className="w-full mt-4 bg-primary/10 hover:bg-primary/20 text-primary font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed" disabled={!user}>
                                {user ? 'Add to Plan' : 'Log in to Add'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            {user ? (
                <div className="lg:col-span-1">
                    <div className="sticky top-24 space-y-6">
                        <div className="bg-card-bg rounded-xl shadow-lg p-6">
                            <h3 className="text-xl font-bold mb-2 text-text-main">AI Tutorial Generator ✨</h3>
                            <p className="text-sm text-text-secondary mb-4">Let AI create a tutorial for you! Review and edit before submitting.</p>
                            <div className="space-y-4">
                                <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="e.g., a paper crane" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none" />
                                <select value={aiSuggestedDifficulty} onChange={e => setAiSuggestedDifficulty(parseInt(e.target.value))} className="w-full p-3 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-primary/50 outline-none">
                                    <option value="1">Beginner</option>
                                    <option value="3">Intermediate</option>
                                    <option value="5">Expert</option>
                                </select>
                                <button onClick={handleGenerateTutorial} disabled={isGenerating} className="w-full bg-primary/80 hover:bg-primary text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all transform hover:scale-105 disabled:bg-slate-400 disabled:cursor-not-allowed">
                                    {isGenerating ? 'Generating...' : 'Generate with AI'}
                                </button>
                            </div>
                        </div>

                        <div className="bg-card-bg rounded-xl shadow-lg p-6">
                            <h3 className="text-xl font-bold mb-4 text-text-main">Submit a New Technique</h3>
                            <form onSubmit={handleTutorialSubmit} className="space-y-4">
                                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" required className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none" />
                                <select value={category} onChange={e => setCategory(e.target.value)} required className="w-full p-3 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-primary/50 outline-none">
                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                                <select value={difficultyScore} onChange={e => setDifficultyScore(parseInt(e.target.value))} className="w-full p-3 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-primary/50 outline-none">
                                    {Object.entries(difficultyMap).map(([score, name]) => <option key={score} value={score}>{name}: {'⭐'.repeat(parseInt(score))}</option>)}
                                </select>
                                <textarea value={steps} onChange={e => setSteps(e.target.value)} placeholder="Enter steps, one per line..." required className="w-full p-3 border border-slate-300 rounded-lg h-32 resize-none focus:ring-2 focus:ring-primary/50 outline-none"></textarea>
                                <button type="submit" className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">Submit</button>
                            </form>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="lg:col-span-1">
                    <div className="sticky top-24 space-y-6">
                         <div className="bg-card-bg rounded-xl shadow-lg p-8 text-center">
                            <h3 className="text-xl font-bold mb-2 text-text-main">Contribute!</h3>
                            <p className="text-text-secondary mb-4">Log in or sign up to submit your own tutorials or use the AI generator.</p>
                            <button onClick={onAuthRequest} className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                                Log in / Sign up
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const MyPlanView: React.FC<{ user: User | null; onAuthRequest: () => void; }> = ({ user, onAuthRequest }) => {
    const [myPlan, setMyPlan] = useState<UserPlan | null>(null);
    const [tutorials, setTutorials] = useState<Tutorial[]>([]);

    useEffect(() => {
        const q = query(collection(db, "tutorials"));
        const unsubscribeTutorials = onSnapshot(q, (snapshot) => {
            const tuts: Tutorial[] = [];
            snapshot.forEach(doc => tuts.push({id: doc.id, ...doc.data()} as Tutorial));
            setTutorials(tuts);
        });
        
        if (!user) {
            setMyPlan(null);
            return;
        }

        const planRef = doc(db, "plans", user.uid);
        const unsubscribePlan = onSnapshot(planRef, (doc) => {
            if (doc.exists()) {
                setMyPlan(doc.data() as UserPlan);
            } else {
                setMyPlan({ items: [] });
            }
        });

        return () => {
            unsubscribeTutorials();
            unsubscribePlan();
        };
    }, [user]);

    const handleStatusChange = async (tutorialId: string, newStatus: PlanStatus) => {
        if (!user || !myPlan) return;

        const newItems = myPlan.items.map(item =>
            item.tutorialId === tutorialId ? { ...item, status: newStatus } : item
        );

        const planRef = doc(db, "plans", user.uid);
        await updateDoc(planRef, { items: newItems });
    };

    if (!user) {
        return (
             <div className="text-center mt-8 max-w-md mx-auto bg-card-bg p-8 rounded-xl shadow-lg">
                <h3 className="text-2xl font-bold mb-2 text-text-main">Track Your Progress</h3>
                <p className="text-text-secondary mb-6">Log in to create your personal origami plan and keep track of the tutorials you want to try.</p>
                <button onClick={onAuthRequest} className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                    Log in / Sign up
                </button>
            </div>
        );
    }
    
    if (!myPlan || myPlan.items.length === 0) {
        return <p className="text-center text-text-secondary mt-8">Your plan is empty. Add some tutorials to get started!</p>;
    }

    const tutorialsMap = new Map<string, Tutorial>(tutorials.map(t => [t.id, t]));

    return (
        <div className="max-w-4xl mx-auto">
            {myPlan.items.sort((a,b) => a.addedDate - b.addedDate).map(item => {
                const tutorial = tutorialsMap.get(item.tutorialId);
                if (!tutorial) return null;

                return (
                    <div key={item.tutorialId} className="bg-card-bg rounded-xl shadow-lg p-6 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-xl font-bold text-text-main">{tutorial.title}</h3>
                            <div className="flex items-center">
                                {'⭐'.repeat(tutorial.difficultyScore).padEnd(5, '☆')}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <select 
                                value={item.status} 
                                onChange={(e) => handleStatusChange(item.tutorialId, e.target.value as PlanStatus)}
                                className="p-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-primary/50 outline-none"
                            >
                                <option>To Try</option>
                                <option>In Progress</option>
                                <option>Completed</option>
                            </select>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const ProfileView: React.FC<{ userId: string; onClose: () => void }> = ({ userId, onClose }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserPosts = async () => {
      if (!userId) return;
      setIsLoading(true);
      try {
        const postsRef = collection(db, "posts");
        const q = query(postsRef, where("userId", "==", userId), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        const userPosts: Post[] = [];
        querySnapshot.forEach((doc) => {
          userPosts.push({ id: doc.id, ...doc.data() } as Post);
        });
        setPosts(userPosts);
      } catch (error) {
        console.error("Error fetching user posts:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserPosts();
  }, [userId]);

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={onClose} className="mb-6 bg-slate-200 hover:bg-slate-300 text-text-secondary font-semibold py-2 px-4 rounded-lg transition-colors">
        &larr; Back to Feed
      </button>
      <div className="bg-card-bg rounded-xl shadow-lg p-8 mb-8">
        <h2 className="text-3xl font-bold text-text-main mb-2">User Profile</h2>
        <p className="text-text-secondary">Creations by user:</p>
        <p className="text-lg font-mono bg-light-bg p-2 rounded mt-1 inline-block break-all">{userId}</p>
      </div>

      {isLoading ? (
        <p className="text-center text-text-secondary mt-8">Loading posts...</p>
      ) : posts.length > 0 ? (
        <div className="space-y-6">
          {posts.map(post => (
            <div key={post.id} className="bg-card-bg rounded-xl shadow-lg p-6 flex flex-col sm:flex-row gap-6">
              <div className="flex-shrink-0 w-full sm:w-48 h-48 relative">
                 {post.media && post.media.length > 0 ? (
                    <>
                        {post.media[0].type === 'video' ? (
                            <video src={post.media[0].url} className="w-full h-full object-cover rounded-lg bg-black" />
                        ) : (
                            <img src={post.media[0].url} alt={post.title} className="w-full h-full object-cover rounded-lg" />
                        )}
                        {post.media.length > 1 && (
                            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded-full z-10 flex items-center gap-1" title={`${post.media.length} items`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                </svg>
                                <span>{post.media.length}</span>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full bg-slate-200 rounded-lg flex items-center justify-center text-text-secondary">No Media</div>
                )}
              </div>
              <div className="flex-grow">
                <h3 className="text-2xl font-bold text-text-main">{post.title}</h3>
                <p className="text-text-secondary mt-2">{post.description}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-text-secondary border-t pt-8 mt-8">
            <p>This user hasn't posted anything yet.</p>
        </div>
      )}
    </div>
  );
};


// --- MAIN APP COMPONENT ---
export default function OrigamiHub() {
    const [user, setUser] = useState<User | null>(null);
    const [view, setView] = useState<View>('feed');
    const [loading, setLoading] = useState(true);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // One-time database seeding
    useEffect(() => {
        const seedDatabaseIfNeeded = async () => {
            const tutorialsRef = collection(db, "tutorials");
            const q = query(tutorialsRef, limit(1));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                console.log("No tutorials found. Seeding database with basic tutorials...");
                
                const basicTutorials = [
                    {
                        title: 'Classic Crane',
                        difficulty: 'Intermediate',
                        difficultyScore: 3,
                        category: 'Animals',
                        authorId: 'origamihub-admin',
                        steps: [
                            'Start with a square piece of paper, colored side up. Fold in half diagonally to make a triangle.',
                            'Fold the top corner of the triangle down to the bottom edge.',
                            'Unfold the last step. Now fold the top point down to the crease you just made.',
                            'Fold the top flaps down along the center crease.',
                            'Fold the two bottom points up to the top point.',
                            'Turn the model over.',
                            'Fold the bottom edge up to the top edge.',
                            'Perform an inside-reverse fold on both sides to create the head and tail.',
                            'Fold the wings down.',
                            'Shape the head and your crane is complete!'
                        ]
                    },
                    {
                        title: 'Jumping Frog',
                        difficulty: 'Easy',
                        difficultyScore: 2,
                        category: 'Animals',
                        authorId: 'origamihub-admin',
                        steps: [
                            'Start with a rectangular piece of paper (like half a square).',
                            'Fold the top left corner down to meet the right edge, making a triangle. Unfold.',
                            'Repeat with the top right corner to the left edge. Unfold. You should have an X crease.',
                            'Push the sides inwards along the creases, collapsing the top into a triangle.',
                            'Fold the bottom corners of the triangle up to the top point.',
                            'Fold the outer edges to the center line.',
                            'Fold the bottom half of the model up to the top.',
                            'Fold that same section back down, creating a Z-shaped fold for the spring.',
                            'Flip it over and press on its back to make it jump!'
                        ]
                    },
                    {
                        title: 'Simple Butterfly',
                        difficulty: 'Beginner',
                        difficultyScore: 1,
                        category: 'Animals',
                        authorId: 'origamihub-admin',
                        steps: [
                            'Start with a square, colored side up. Fold in half diagonally to make a triangle.',
                            'Fold in half again to make a smaller triangle.',
                            'Open one flap and fold the point up, past the top edge.',
                            'Flip the model over.',
                            'Fold the remaining point down, past the bottom edge. This will become the butterfly\'s body.',
                            'Tuck the tip of that point into the fold on the other side to lock it.',
                            'Gently fold the whole model in half to give the wings shape. Your butterfly is ready to fly.'
                        ]
                    },
                     {
                        title: 'Samurai Helmet',
                        difficulty: 'Beginner',
                        difficultyScore: 1,
                        category: 'Wearables',
                        authorId: 'origamihub-admin',
                        steps: [
                            'Start with a square piece of paper.',
                            'Fold the paper in half to make a triangle.',
                            'Fold the two bottom corners up to meet the top corner.',
                            'You should now have a smaller square shape.',
                            'Take the top layer of the bottom corner and fold it upwards.',
                            'Flip the model over.',
                            'Fold the remaining bottom corner up.',
                            'Tuck the corner inside the pocket of the helmet.',
                            'Open up the bottom and your helmet is ready to wear.'
                        ]
                    },
                    {
                        title: 'Fortune Teller (Cootie Catcher)',
                        difficulty: 'Easy',
                        difficultyScore: 2,
                        category: 'Practical',
                        authorId: 'origamihub-admin',
                        steps: [
                            'Start with a square piece of paper.',
                            'Fold all four corners into the center.',
                            'Flip the paper over.',
                            'Again, fold all four corners into the center.',
                            'Fold the square in half, crease, and unfold. Then fold in half the other way.',
                            'Slide your thumbs and index fingers under the four flaps.',
                            'Push them together towards the center to form the fortune teller.',
                            'Decorate by writing colors on the outside flaps and numbers inside.'
                        ]
                    },
                    {
                        title: 'Simple Fox Face',
                        difficulty: 'Beginner',
                        difficultyScore: 1,
                        category: 'Animals',
                        authorId: 'origamihub-admin',
                        steps: [
                            'Start with a square, colored side up. Fold in half diagonally.',
                            'Take the left and right corners of the triangle and fold them up to the top corner to form a square.',
                            'Flip the model over.',
                            'Fold the top point down about one-third of the way. This forms the ears.',
                            'Flip the model back over.',
                            'Fold the bottom point up slightly to form the chin.',
                            'Use a pen to draw a nose and eyes.'
                        ]
                    },
                    {
                        title: 'Traditional Boat (Sampan)',
                        difficulty: 'Beginner',
                        difficultyScore: 1,
                        category: 'Practical',
                        authorId: 'origamihub-admin',
                        steps: [
                            'Start with a square piece of paper.',
                            'Fold it in half to make a rectangle.',
                            'Fold it in half again to make a square.',
                            'Orient the square so the open corners are at the top.',
                            'Fold the top layer\'s corner down to the bottom corner.',
                            'Flip the model over.',
                            'Repeat the last step on this side.',
                            'You now have a triangle. Gently open the bottom to form a square.',
                            'Fold the bottom corners (just the top layer) up to the top corner.',
                            'Pull the sides apart, and the boat will take shape.'
                        ]
                    },
                    {
                        title: 'Simple Heart',
                        difficulty: 'Beginner',
                        difficultyScore: 1,
                        category: 'Holidays',
                        authorId: 'origamihub-admin',
                        steps: [
                           'Start with a square piece of paper, colored side up. Fold in half to make a rectangle and unfold.',
                           'Fold the top and bottom edges to meet the center crease.',
                           'Flip the model over.',
                           'Fold the right side over to meet the center line.',
                           'Repeat with the left side.',
                           'Flip the model back over.',
                           'Fold down the four corners at the top to shape the top of the heart.',
                           'Fold in the two side points to soften the shape.',
                           'Your origami heart is complete!'
                        ]
                    }
                ];

                const promises = basicTutorials.map(tutorial => addDoc(tutorialsRef, tutorial));
                await Promise.all(promises);
                console.log("Database seeded successfully with 8 basic tutorials!");
            }
        };

        seedDatabaseIfNeeded();
    }, []);

    const handleAuthAction = useCallback(() => {
        if (user) {
            signOut(auth);
        } else {
            setIsAuthModalOpen(true);
        }
    }, [user]);

    const handleViewProfile = (userId: string) => {
        setProfileUserId(userId);
    };

    const handleCloseProfile = () => {
        setProfileUserId(null);
    };
    
    const renderView = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center p-10">
                    <div className="bg-card-bg rounded-xl shadow-lg px-6 py-4 text-text-secondary font-medium">Loading OrigamiHub...</div>
                </div>
            );
        }

        if (profileUserId) {
            return <ProfileView userId={profileUserId} onClose={handleCloseProfile} />;
        }
        
        const onAuthRequest = () => setIsAuthModalOpen(true);

        switch (view) {
            case 'tutorials': return <TutorialsView user={user} onAuthRequest={onAuthRequest} />;
            case 'myplan': return <MyPlanView user={user} onAuthRequest={onAuthRequest} />;
            case 'feed':
            default:
                return <FeedView user={user} onViewProfile={handleViewProfile} onAuthRequest={onAuthRequest} />;
        }
    };

    return (
        <div className="min-h-screen bg-light-bg text-text-main font-sans">
            {isAuthModalOpen && <AuthModal onClose={() => setIsAuthModalOpen(false)} />}
            <Header currentView={view} setView={setView} user={user} handleAuth={handleAuthAction} />
            <main className="container mx-auto p-4 sm:p-6 lg:p-8">
                {renderView()}
            </main>
        </div>
    );
}
