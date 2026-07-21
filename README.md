
# Node.js CICD Deployment with GitLab Self-Hosted Runner on AWS EC2

This project demonstrates a CI/CD pipeline for a Node.js app using Jenkins with a self-hosted runner on an EC2 instance.

## Project Overview

1. **Created a Node.js app** (`server.js`) that listens on port 8080.

2. **Built a Dockerfile** to containerize the Node.js app.

3. **Set up a GitLab self-hosted runner** on an EC2 instance:
   - Installed and registered `gitlab-runner` with tag `ec2-runner`.
   - Used shell executor to run jobs directly on EC2.

4. **Configured `.gitlab-ci.yml`** with `build` and `deploy` stages:
   - `build` stage builds the Docker image.
   - `deploy` stage stops any existing container and runs the new one.

5. **Pushed the pipeline to GitLab**, triggering the runner to build and deploy the app.

6. **Verified the app** is running on EC2 by checking Docker containers and accessing the app on port 8080.

## How to use

- Clone this repo.
- Push changes to GitLab.
- Ensure your runner is registered and tagged properly.
- Make sure Docker is installed and running on your EC2.
- Access the app at `http://<your-ec2-ip>:8080`.

---

