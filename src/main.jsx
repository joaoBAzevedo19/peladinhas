import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DataProvider } from './data/DataContext.jsx';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DataProvider>
      <App />
    </DataProvider>
  </StrictMode>,
);
