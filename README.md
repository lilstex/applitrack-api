# AppliTrack - Backend API

The **AppliTrack API** is a high-performance NestJS service designed to handle AI-driven content generation, dynamic PDF rendering, and job application lifecycle management. It serves as the core engine for AppliTrack, transforming raw user profiles into optimized, ATS-ready career documents.

## 🛠️ Core Tech Stack

- **Framework:** [NestJS](https://nestjs.com/) (Node.js)
- **Database:** [MongoDB](https://www.mongodb.com/) with [Mongoose](https://mongoosejs.com/)
- **AI Engine:** [OpenAI SDK](https://openai.com/) (GPT-4o/Claude integration)
- **PDF Engine:** [Puppeteer](https://pptr.dev/) (Headless Chromium)
- **Documentation:** [Swagger / OpenAPI 3.0](https://swagger.io/)
- **Authentication:** JWT with Passport.js
- **Validation:** Class-validator & Class-transformer

## ✨ Key Features & Engineering Highlights

- **AI Content Tailoring:** Utilizes prompt engineering and the **X-Y-Z formula** to rewrite work experience highlights based on specific job descriptions.
- **Eager Sorting Engine:** Implements a custom chronological sorting algorithm for experience and education to ensure data is always stored in reverse-chronological order.
- **Dynamic PDF Generation:** A robust PDF engine using Puppeteer that converts EJS templates into pixel-perfect A4 documents with automatic page-break handling.
- **Status State Machine:** A structured application tracking system using TypeScript Enums and atomic MongoDB updates (`$set`).
- **Atomic Data Integrity:** Leveraging Mongoose instance methods to ensure data consistency during complex profile updates.

## ⚙️ Development Setup

### 1. Prerequisites

- Node.js 20+
- MongoDB Instance (Local or Atlas)
- OpenAI API Key

### 2. Environment Configuration

Create a `.env` file in the root directory (Reference .env.example file):

| Variable         | Description                                 |
| ---------------- | ------------------------------------------- |
| `PORT`           | The port the server runs on (default: 2200) |
| `MONGO_URI`      | Your MongoDB connection string              |
| `JWT_SECRET`     | Secret key for signing tokens               |
| `OPENAI_API_KEY` | Your OpenAI secret key                      |

### 3. Installation

```bash
$ npm install

```

### 4. Running the App

```bash
# development
$ npm run start

# watch mode (recommended)
$ npm run start:dev

# production mode
$ npm run start:prod

```

## 📖 API Documentation

Once the server is running, you can access the interactive **Swagger UI** to explore and test the endpoints:

📌 **URL:** `http://localhost:2200/api`

The documentation includes:

- Full schema definitions for `User` and `Application` models.
- Status update transitions with Enum validation.
- Auth-locked endpoints with Bearer Token support.

## 🤝 Contributing

We welcome contributions from senior engineers, AI enthusiasts, and backend specialists!

1. **Strict Typing:** All new features must be fully typed. Avoid `any` at all costs.
2. **DTOs:** Use Data Transfer Objects for all incoming requests with proper `class-validator` decorators.
3. **Architecture:** Follow the NestJS modular pattern. Logic belongs in **Services**, routing in **Controllers**, and data structure in **Schemas**.
4. **Testing:** PRs with unit or integration tests are highly encouraged.

## 📄 License

This project is licensed under the **MIT License**.

**Lead Architect:** [Emmanuel Mbagwu](https://linkedin.com/in/lilstex-emmanuel)
