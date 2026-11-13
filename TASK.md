# Task: The dm drugstore vending machine

Build a small application for a dm drugstore vending machine - a backend and a frontend.
Please also read the [instructions](#instructions-for-candidates) at the end - a partial solution is perfectly fine.

## Requirements

- The drugstore vending machine manages 8 different products
- The machine can be filled with products
- Customers can buy products and the machine calculates the total price
- You can only buy as many products as there are in the machine

The requirements are intentionally kept open. Where something is not specified, make your own decisions - we will discuss them during the interview.

## Products

| ID | Name                                | Product group    | Price (€) |
|---:|-------------------------------------|------------------|----------:|
|  1 | Balea shower gel                    | Personal hygiene |      0.55 |
|  2 | SEINZ beard oil                     | Face             |      7.95 |
|  3 | Balea body lotion                   | Personal hygiene |      0.75 |
|  4 | Fotoparadies USB stick 16GB         | Photo            |      6.95 |
|  5 | Nivea night cream Q10               | Face             |     15.95 |
|  6 | Kinderhose (one-size)               | Textile          |      9.90 |
|  7 | All-purpose cleaner Power degreaser | Household        |      1.75 |
|  8 | Profissimo Dirt eraser              | Household        |      2.25 |

## Technical requirements

- A backend exposing an API that is used by the frontend
- A frontend with at least one view
- The functionality of the machine should be ensured through tests
- No real persistence layer is necessary (in-memory is fine)

---

## Instructions for candidates

### Time expectation

**There is no strict time limit.** We expect roughly 2-4 hours, but this is only a guideline - feel free to spend as much or as little time as you like.

This task will serve as a foundation for our technical discussion. **We do not require a fully working solution** - it's perfectly fine to submit partial implementation.

### Starter template

This repository contains a **starter template** with a basic backend and frontend setup (see [README.md](README.md) for how to run it):

- **Backend:** Java 25, Spring Boot 4, Maven
- **Frontend:** React 19, TypeScript, Vite

The template is only a starting point - **feel free to change anything**: the project structure, dependencies, tooling or even the technologies themselves, as long as the [technical requirements](#technical-requirements) are met.

### How to submit

Please send your solution **before the interview** - as a link to a private repository or as a ZIP file.
