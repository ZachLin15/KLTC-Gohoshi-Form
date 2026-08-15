import React from "react";
import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import InstallPrompt from "./components/InstallPrompt";
import Calendar from "./pages/Calendar";
import AdminApp from "./pages/Admin/AdminApp";

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Calendar />} />
        <Route path="/admin" element={<AdminApp />} />
      </Routes>
      <InstallPrompt />
    </>
  );
}
