# Weather Agent - Mastra Monorepo

A modern weather agent built with Mastra, featuring a React frontend and Node.js backend with MCP (Model Context Protocol) tools for weather data and Mux video processing.

## 🏗️ Project Structure

This project follows a monorepo structure with clear separation of concerns:

```
weather-agent-monorepo/
├── backend/                 # Mastra backend server
│   ├── src/
│   │   ├── agents/         # Weather agent implementation
│   │   ├── tools/          # Weather and utility tools
│   │   ├── mcp/           # MCP server implementations
│   │   └── scripts/       # Test and utility scripts
│   ├── files/             # Static files (images, audio)
│   └── package.json
├── frontend/               # React frontend application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Client libraries
│   │   └── utils/         # Frontend utilities
│   └── package.json
├── shared/                 # Shared types and utilities
│   ├── src/
│   │   ├── types/         # TypeScript type definitions
│   │   └── utils/         # Shared utility functions
│   └── package.json
├── scripts/               # Build and deployment scripts
├── docs/                 # Documentation
└── package.json          # Root package.json (monorepo config)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ 
- npm or yarn
- API keys for Mux and Mastra (weather data is free from National Weather Service)

### Installation

1. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd weather-agent-monorepo
   ./scripts/setup.sh
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your API keys
   ```

3. **Start development:**
   ```bash
   npm run dev
   ```

This will start both the backend server (port 3001) and frontend (port 3000).

## 📦 Available Scripts

### Root Level (Monorepo)
- `npm run dev` - Start both backend and frontend in development mode
- `npm run build` - Build all packages
- `npm run start:prod` - Start production server
- `npm run clean` - Clean all build artifacts
- `npm run typecheck` - Type check all packages
- `npm run test` - Run all tests

### Backend
- `npm run dev:backend` - Start backend development server
- `npm run build:backend` - Build backend
- `npm run test:agent` - Test weather agent
- `npm run test:claude` - Test Claude integration
- `npm run test:stt` - Test speech-to-text
- `npm run test:tts` - Test text-to-speech

### Frontend
- `npm run dev:frontend` - Start frontend development server
- `npm run build:frontend` - Build frontend
- `npm run test:frontend` - Run frontend tests

## 🔧 Configuration

### Environment Variables

Create a `.env` file based on `env.example`:

```bash
# Backend Configuration
NODE_ENV=development
PORT=3001

# Mastra Configuration
MASTRA_API_KEY=your_mastra_api_key_here

# Weather API Configuration (National Weather Service - Free, No API Key Required)
WEATHER_MCP_USER_AGENT=WeatherAgent/1.0 (weather-agent@streamingportfolio.com)

# Mux Configuration
MUX_TOKEN_ID=your_mux_token_id_here
MUX_TOKEN_SECRET=your_mux_token_secret_here

# Frontend Configuration
VITE_MASTRA_API_HOST=http://localhost:3001
VITE_WEATHER_AGENT_ID=weather
```

### API Keys Required

1. **National Weather Service API** - Free weather data (no API key required)
   - Uses [api.weather.gov](https://www.weather.gov/documentation/services-web-api)
   - Provides forecasts, alerts, and observations
   - Requires User-Agent header for identification
2. **Mux API** - For video processing and streaming
3. **Mastra API** - For AI agent functionality

## 🏛️ Architecture

### Backend (Mastra Server)
- **Agents**: Weather agent with conversational AI capabilities
- **Tools**: Weather data fetching and processing tools
- **MCP Servers**: Weather and Mux integration servers
- **Memory**: Persistent conversation memory
- **Streaming**: Real-time response streaming

### Frontend (React App)
- **Components**: Modular React components
- **Hooks**: Custom hooks for state management
- **Client**: Mastra client for backend communication
- **UI**: Modern, responsive interface with Tailwind CSS

### Shared
- **Types**: TypeScript definitions shared between frontend and backend
- **Utils**: Common utility functions and validation schemas

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm run test:agent      # Test weather agent
npm run test:claude     # Test Claude integration
npm run test:stt        # Test speech-to-text
npm run test:tts        # Test text-to-speech
```

### Frontend Tests
```bash
cd frontend
npm run test           # Run all frontend tests
npm run test:watch     # Run tests in watch mode
```

## 🚀 Deployment

### Docker Deployment
```bash
# Build Docker image
docker build -t weather-agent .

# Run container
docker run -p 3001:3001 --env-file .env weather-agent
```

### Manual Deployment
```bash
# Build all packages
npm run build

# Start production server
npm run start:prod
```

## 📚 Features

### Weather Agent
- **Conversational AI**: Natural language weather queries
- **Real-time Data**: Live weather information
- **Voice Support**: Speech-to-text and text-to-speech
- **Memory**: Persistent conversation context
- **Streaming**: Real-time response streaming

### Mux Integration
- **Video Processing**: Upload and process audio/video files
- **Streaming**: Video streaming capabilities
- **Asset Management**: Organize and manage media assets

### Frontend Features
- **Modern UI**: Clean, responsive interface
- **Real-time Chat**: Live conversation with the agent
- **Theme Support**: Light/dark theme toggle
- **Error Handling**: Comprehensive error boundaries
- **TypeScript**: Full type safety

## 🔍 Troubleshooting

### Common Issues

1. **Port Conflicts**: Ensure ports 3000 and 3001 are available
2. **API Keys**: Verify all required API keys are set in `.env`
3. **Dependencies**: Run `npm run install:all` to install all dependencies
4. **Build Issues**: Run `npm run clean` then `npm run build`

### Debug Mode
```bash
# Backend debug
npm run debug:agent

# Frontend debug
cd frontend && npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation in the `docs/` folder
- Review the troubleshooting section above