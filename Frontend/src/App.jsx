import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import PlannerPage from './pages/PlannerPage';
import DailyLogVisualizer from './pages/DailyLogVisualizer';

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="relative min-h-screen bg-black overflow-x-hidden">
          {/* Floating Navigation */}
          <Navbar />

          {/* 
            Main page content offset below fixed navbar.
            pt-36 creates proper breathing room and prevents
            hero section clipping beneath the navigation.
          */}
          <main className="pt-24">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/logs" element={<DailyLogVisualizer />} />
            </Routes>
          </main>
        </div>
      </Router>
    </ThemeProvider>
  );
}