import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getToken } from "./auth.js";
import AppShell from "./components/AppShell.js";
import LoginPage from "./pages/LoginPage.js";
import ChoosePage from "./pages/ChoosePage.js";
import WeekDetailPage from "./pages/WeekDetailPage.js";
import RecipePage from "./pages/RecipePage.js";
import ShoppingListPage from "./pages/ShoppingListPage.js";
import PreferencesPage from "./pages/PreferencesPage.js";
import ShopPage from "./pages/ShopPage.js";
import CookPage from "./pages/CookPage.js";
import CookWeekPage from "./pages/CookWeekPage.js";
import EatPage from "./pages/EatPage.js";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(getToken() !== null);
  }, []);

  if (authed === null) return null;

  const handleLogin = () => {
    window.history.replaceState({}, "", "/choose");
    setAuthed(true);
  };

  const handleSignOut = () => {
    window.history.replaceState({}, "", "/");
    setAuthed(false);
  };

  if (!authed) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <AppShell onSignOut={handleSignOut}>
        <Routes>
          <Route path="/" element={<Navigate to="/choose" replace />} />
          <Route path="/choose" element={<ChoosePage />} />
          <Route path="/weeks/:weekStart" element={<WeekDetailPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/shopping" element={<ShoppingListPage />} />
          <Route path="/cook" element={<CookPage />} />
          <Route path="/cook/:weekStart" element={<CookWeekPage />} />
          <Route path="/eat" element={<EatPage />} />
          <Route path="/recipes/:id" element={<RecipePage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="/week" element={<Navigate to="/choose" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
