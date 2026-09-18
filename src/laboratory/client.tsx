import { createRoot } from 'react-dom/client';
import { Laboratory } from './Laboratory.tsx';
import '../client/style.css';
import './single-text/style.css';
import './laboratory.css';
createRoot(document.getElementById('root')!).render(<Laboratory />);
