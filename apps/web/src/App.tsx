import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getToken } from "./auth.js";
import NavBar from "./components/NavBar.js";
import LoginPage from "./pages/LoginPage.js";
import WeekPage from "./pages/WeekPage.js";
import WeekDetailPage from "./pages/WeekDetailPage.js";
import RecipePage from "./pages/RecipePage.js";
import ShoppingListPage from "./pages/ShoppingListPage.js";
import PreferencesPage from "./pages/PreferencesPage.js";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(getToken() !== null);
  }, []);

  if (authed === null) return null;

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/week" replace />} />
        <Route path="/week" element={<WeekPage />} />
        <Route path="/weeks/:weekStart" element={<WeekDetailPage />} />
        <Route path="/recipes/:id" element={<RecipePage />} />
        <Route path="/shopping" element={<ShoppingListPage />} />
        <Route path="/preferences" element={<PreferencesPage />} />
      </Routes>
      <NavBar onSignOut={() => setAuthed(false)} />
    </BrowserRouter>
  );
}
