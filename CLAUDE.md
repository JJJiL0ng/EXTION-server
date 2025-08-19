# Extion Server - Claude Code Documentation

## Project Overview
Extion Server is an AI-powered spreadsheet processing system built with NestJS, featuring real-time collaborative editing, multi-modal AI chat integration, and comprehensive data analysis capabilities. The system supports Korean language prompts and provides intelligent spreadsheet manipulation through various AI chat modules.

## Architecture

### Core Technologies
- **Framework**: NestJS (Node.js)
- **Database**: PostgreSQL with Prisma ORM
- **AI Integration**: Google Gemini API
- **Authentication**: Firebase Auth
- **Data Processing**: SpreadJS compatible format
- **Compression**: GZIP for spreadsheet data storage

### Module Structure

#### Chat Modules (`src/chat-modules/`)
- **OrchestratorChatModule**: Main AI routing system that analyzes user intent and delegates to specialized chat services
- **GeneralChatModule**: General spreadsheet analysis and Q&A
- **FunctionChatModule**: Excel/spreadsheet function execution
- **DataEditChatModule**: Data modification operations
- **DataGenerateChatModule**: New data/sheet creation
- **VisualizationGenerateChatModule**: Chart and visualization generation
- **AnalyzeUserIntentModule**: NLP-based intent classification

#### Sheet Modules (`src/v2/sheet/`)
- **TableDataJsonParsingModule**: Spreadsheet data parsing and validation
- **TableDataJsonSaveModule**: Data persistence with compression and delta management

#### Support Modules
- **AuthModule**: Firebase-based authentication
- **PrismaModule**: Database connection and ORM
- **GeminiApiModule**: AI API integration

## Database Schema

### Core Models
```prisma
User: Firebase-authenticated users with preferences and statistics
SpreadSheet: Main spreadsheet metadata with versioning
SpreadSheetData: Compressed JSON data storage with integrity hashing
EditHistory: Session-based editing with delta tracking
DeltaRecord: Individual change operations
Chat: AI conversation threads
Message: Individual chat messages with context
GPTCache: AI response caching for performance
```

### Key Features
- **Delta Management**: Real-time change tracking with sequence guarantees
- **Data Integrity**: SHA-256 hashing for corruption detection
- **Compression**: GZIP compression for large spreadsheet storage
- **Versioning**: File version tracking with migration support

## AI Chat System

### Orchestrator Pattern
The `OrchestratorChatService` acts as a smart router:
1. Analyzes user intent using NLP
2. Routes to appropriate specialized chat service
3. Handles guest user creation automatically
4. Maintains consistent response format across all chat types

### Chat Types
- **GENERAL**: Data analysis, insights, and Q&A
- **FUNCTION**: Excel function execution and formula assistance
- **EDIT**: Data modification, sorting, filtering
- **GENERATION**: New data creation, sheet generation
- **VISUALIZATION**: Chart and graph creation

### Korean Language Support
- All AI prompts are in Korean (`src/prompts/kr/`)
- Handlebars templating for dynamic prompt generation
- Context-aware data analysis with spreadsheet metadata

## Development Workflows

### Common Commands
```bash
# Development
npm run start:dev

# Database
npx prisma generate
npx prisma db push
npx prisma studio

# Type checking (when available)
npm run typecheck
npm run lint
```

### Type Safety Implementation
- Comprehensive TypeScript interfaces in `types/spreadsheet.types.ts`
- Custom error classes for different failure modes
- Type guards for runtime validation
- Prisma type integration with JSON serialization

### Data Processing Pipeline
1. **Upload**: SpreadJS-compatible JSON parsing
2. **Compression**: GZIP compression with integrity hashing
3. **Delta Tracking**: Session-based change recording
4. **AI Processing**: Context-aware analysis with cached responses
5. **Real-time Updates**: Delta application for collaborative editing

## Key Design Patterns

### Memory Management
- Session-based editing with automatic cleanup
- Delta compression for change history
- Cached AI responses with TTL
- Large file handling with streaming

### Error Handling
- Custom error classes: `SpreadSheetError`, `ValidationError`, `DeltaValidationError`
- Type-safe error extraction and propagation
- Graceful degradation for invalid data

### Security
- Firebase authentication integration
- User isolation for data access
- Input validation at all API boundaries
- No sensitive data logging

## API Specifications

### Spreadsheet Data Format
See `DATA_SPECIFICATION.md` for detailed API contracts including:
- Simplified data structures eliminating redundancy
- Consistent string-based data representation
- Comprehensive change tracking
- Error response standardization

### Chat API
All chat endpoints follow the orchestrator pattern with consistent response formats containing:
- Success status and error handling
- Chat metadata (IDs, timestamps)
- Type-specific response data
- Spreadsheet context when available

## Performance Optimizations

### Caching Strategy
- AI response caching based on data+question hash
- Database indexes on frequently queried fields
- Compressed data storage reducing I/O

### Memory Efficiency
- Delta-based change tracking instead of full snapshots
- Session cleanup for inactive users
- Lazy loading of spreadsheet data

## Testing & Quality

### Type Safety
- Strict TypeScript configuration
- Runtime type validation with type guards
- Comprehensive error handling

### Database Integrity
- Foreign key constraints with cascade deletion
- Unique constraints for data consistency
- Index optimization for query performance

## Deployment Notes

### Environment Configuration
- Firebase credentials for authentication
- Database connection via `DATABASE_URL`
- Gemini API keys for AI integration

### Monitoring
- Structured logging with NestJS Logger
- Error tracking for AI processing failures
- Performance metrics for large file operations

---

*This documentation should be updated when significant architectural changes occur, especially to the chat orchestration system or database schema.*