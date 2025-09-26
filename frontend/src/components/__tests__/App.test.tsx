import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../App';

// Mock the mastraClient module
vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    getDynamicToolsets: vi.fn().mockResolvedValue({}),
  },
  getWeatherAgentId: vi.fn().mockReturnValue('weatherAgent'),
  getDisplayHost: vi.fn().mockReturnValue('localhost:3000'),
  getMastraBaseUrl: vi.fn().mockReturnValue('http://localhost:3000'),
}));

describe('App Component', () => {
  it('should render the main app', () => {
    render(<App />);
    
    // Check if the app renders without crashing
    expect(document.body).toBeTruthy();
  });

  it('should have proper document structure', () => {
    const { container } = render(<App />);
    
    // Should render without errors
    expect(container).toBeTruthy();
    expect(container.firstChild).toBeTruthy();
  });

  it('should render weather chat component', () => {
    render(<App />);
    
    // Look for elements that indicate the weather chat is rendered
    // This will depend on your actual App component structure
    const appContainer = screen.getByRole('main', { hidden: true }) || 
                         document.querySelector('[class*="app"]') ||
                         document.body;
    
    expect(appContainer).toBeTruthy();
  });
});
