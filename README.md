# Job Portal Backend API

Professional Node.js + Express + MongoDB backend for job portal application.

## 🚀 Features

- **Authentication**: JWT-based auth for Users, Companies, and Admins
- **Job Management**: Full CRUD for job postings with advanced filtering
- **Application Tracking**: Application management with status updates
- **Real-time Chat**: Socket.IO powered messaging system
- **Notifications**: Real-time notification system
- **Resume Parsing**: Integration with resume parser service
- **Email Service**: Automated email notifications
- **File Uploads**: Support for resumes, photos, certificates, videos
- **Advanced Search**: Full-text search with filters
- **Analytics**: Dashboard with statistics and charts

## 🛠️ Tech Stack

- **Runtime**: Node.js 22.x
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT + Passport.js
- **Real-time**: Socket.IO
- **File Upload**: Multer
- **Email**: Nodemailer
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Joi

## 📦 Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your values
# See Configuration section below
```

## ⚙️ Configuration

Edit `.env` file:

```env
# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
MONGODB_URI=your_mongodb_connection_string

# JWT
JWT_SECRET=your_jwt_secret_key_here

# Email (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_specific_password

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Resume Parser Service (Optional)
RESUME_PARSER_URL=http://localhost:5001
```

## 🏃‍♂️ Running Locally

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Seed admin user
npm run seed-admin
```

## 🌐 Deployment on Render

### Quick Deploy Button
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Manual Deployment

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/job-portal-backend.git
   git push -u origin main
   ```

2. **Create Web Service on Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click **New** → **Web Service**
   - Connect your GitHub repository
   - Configure:
     - **Name**: `job-portal-backend`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: Free

3. **Add Environment Variables**
   In Render dashboard, add all variables from `.env.example`

4. **Deploy**
   - Click **Create Web Service**
   - Wait for deployment (5-10 minutes)
   - Get your backend URL: `https://job-portal-backend.onrender.com`

### Important Notes for Render

- **Free tier sleeps after 15 min**: First request may be slow
- **Monthly hours**: 750 hours free per month
- **Database**: Use MongoDB Atlas (free tier available)
- **File uploads**: Use external storage (Cloudinary/AWS S3) for production

## 🔗 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/company/auth/register` - Company registration
- `POST /api/company/auth/login` - Company login
- `POST /api/admin/auth/login` - Admin login

### Jobs
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs` - Create job (company only)
- `PUT /api/jobs/:id` - Update job (company only)
- `DELETE /api/jobs/:id` - Delete job (company only)

### Applications
- `GET /api/applications` - List user applications
- `POST /api/applications` - Apply to job
- `GET /api/company/applications` - List company applications
- `PUT /api/company/applications/:id` - Update application status

### Profile
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `GET /api/company/profile` - Get company profile
- `PUT /api/company/profile` - Update company profile

[Full API documentation available in `/docs` folder]

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Health check
curl http://localhost:5000
```

## 📁 Project Structure

```
backend/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── models/          # MongoDB models
├── routes/          # API routes
├── middleware/      # Custom middleware
├── utils/           # Helper functions
├── uploads/         # File uploads
├── templates/       # Email templates
└── server.js        # Entry point
```

## 🔒 Security

- JWT authentication with secure tokens
- Password hashing with bcrypt
- Rate limiting to prevent abuse
- CORS configuration
- Helmet for security headers
- Input validation and sanitization
- File upload validation

## 🐛 Troubleshooting

### MongoDB Connection Issues
```bash
# Check MongoDB URI format
mongodb+srv://username:password@cluster.mongodb.net/database

# Whitelist IP in MongoDB Atlas
# Go to Network Access → Add IP Address → Allow Access from Anywhere (for development)
```

### Email Not Sending
```bash
# For Gmail, enable "Less secure app access" or use App Password
# Go to Google Account → Security → App passwords
```

### Port Already in Use
```bash
# Change PORT in .env file
PORT=5001
```

## 📊 Performance

- **Database Indexing**: 58+ optimized indexes
- **Query Optimization**: Lean queries, field selection
- **Caching**: Industry data cached for 5 minutes
- **Response Time**: <200ms average
- **Pagination**: All list endpoints support pagination

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License.

## 📧 Support

For issues and questions:
- Create an issue on GitHub
- Email: support@jobportal.com

## 🔗 Related Projects

- [Frontend Repository](https://github.com/yourusername/job-portal-frontend)
- [Resume Parser Service](https://github.com/yourusername/resume-parser-service)

---

**Built with ❤️ for the job seeking community**
