import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TerminalPage } from "./pages/TerminalPage";
import { CanvasPage } from "./pages/CanvasPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/terminal" replace />} />
        <Route path="/terminal" element={<TerminalPage />} />
        <Route path="/canvas" element={<CanvasPage />} />
      </Routes>
    </BrowserRouter>
  );
}
