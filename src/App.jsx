import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import GroupRoom from './pages/GroupRoom.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/g/:code" element={<GroupRoom />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
