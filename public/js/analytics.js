// Vercel Web Analytics initialization
import { inject } from '@vercel/analytics';

// Initialize analytics with production mode
inject({
  mode: import.meta.env?.MODE === 'development' ? 'development' : 'production'
});
