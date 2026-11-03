import { Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav, InstallBanner, PlayerBar, TopBar } from './components/Chrome.jsx'
import { OfflineNote, Toasts } from './components/ui.jsx'
import { usePlayer } from './context/PlayerContext.jsx'

import Home from './pages/Home.jsx'
import Discover from './pages/Discover.jsx'
import Identify from './pages/Identify.jsx'
import Results from './pages/Results.jsx'
import Videos from './pages/Videos.jsx'
import Watch from './pages/Watch.jsx'
import Library from './pages/Library.jsx'
import Downloads from './pages/Downloads.jsx'
import Search from './pages/Search.jsx'
import SongDetails from './pages/SongDetails.jsx'
import Settings from './pages/Settings.jsx'
import Services from './pages/Services.jsx'
import Privacy from './pages/Privacy.jsx'
import TikTokLink from './pages/TikTokLink.jsx'
import Playlists from './pages/Playlists.jsx'
import PlaylistDetail from './pages/PlaylistDetail.jsx'
import WatchLater from './pages/WatchLater.jsx'
import NotFound from './pages/NotFound.jsx'

function Page({ children, className = '' }) {
  const { current } = usePlayer()
  return (
    <div className={`page ${current ? 'has-player' : ''} ${className}`}>
      <OfflineNote />
      {children}
    </div>
  )
}

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <InstallBanner />
      <main className="shell grow" style={{ width: '100%' }}>
        <Routes>
          <Route path="/" element={<Page><Home /></Page>} />
          <Route path="/discover" element={<Page><Discover /></Page>} />
          <Route path="/identify" element={<Page><Identify /></Page>} />
          <Route path="/results/:id" element={<Page><Results /></Page>} />
          <Route path="/videos" element={<Page><Videos /></Page>} />
          <Route path="/watch/:id" element={<Page><Watch /></Page>} />
          <Route path="/library" element={<Page><Library /></Page>} />
          <Route path="/library/playlists" element={<Navigate to="/playlists" replace />} />
          <Route path="/playlists" element={<Page><Playlists /></Page>} />
          <Route path="/playlists/:id" element={<Page><PlaylistDetail /></Page>} />
          <Route path="/watch-later" element={<Page><WatchLater /></Page>} />
          <Route path="/downloads" element={<Page><Downloads /></Page>} />
          <Route path="/search" element={<Page><Search /></Page>} />
          <Route path="/song/:key" element={<Page><SongDetails /></Page>} />
          <Route path="/settings" element={<Page><Settings /></Page>} />
          <Route path="/services" element={<Page><Services /></Page>} />
          <Route path="/privacy" element={<Page><Privacy /></Page>} />
          <Route path="/tools/tiktok" element={<Page><TikTokLink /></Page>} />
          <Route path="*" element={<Page><NotFound /></Page>} />
        </Routes>
      </main>
      <PlayerBar />
      <BottomNav />
      <Toasts />
    </div>
  )
}

export { Page }
