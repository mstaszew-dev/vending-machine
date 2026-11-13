# Build stage 1: bundle the React frontend
FROM node:22-alpine AS frontend

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build stage 2: compile the Spring Boot backend and embed the bundle as static files,
# so one container serves both the API and the UI.
FROM eclipse-temurin:25-jdk AS backend

WORKDIR /app
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -q -DskipTests dependency:go-offline
COPY src ./src
COPY --from=frontend /app/frontend/dist ./src/main/resources/static
RUN ./mvnw -q -DskipTests package

# Runtime stage: slim JRE, non-root user, no build toolchain.
FROM eclipse-temurin:25-jre

WORKDIR /app
RUN useradd --system --uid 1001 --create-home spring
COPY --from=backend /app/target/vending-machine-0.0.1-SNAPSHOT.jar app.jar
USER spring
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
