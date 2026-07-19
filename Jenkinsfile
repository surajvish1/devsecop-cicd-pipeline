// Jenkinsfile
//
// For surajvish1/node-app-cicd — code lives at the repo root, app listens
// on port 8080 (mapped to host port 80 via docker-compose.yml).
//
// SECURITY GATES TOGGLE: SonarQube/Gitleaks/Trivy/Jira stages only run when
// ENABLE_SECURITY_GATES is true. OFF by default until those services exist.
//
// Prerequisites configured in Jenkins before this runs:
//   - Credentials: 'dockerhub-creds' (DockerHub username/password),
//     'ec2-ssh-key' (SSH private key matching ~/.ssh/devsecops-ci)

pipeline {
    agent any

    parameters {
        booleanParam(name: 'ENABLE_SECURITY_GATES', defaultValue: false,
            description: 'Run SonarQube/Gitleaks/Trivy/Jira stages. Leave off until those services are deployed.')
    }

    environment {
        IMAGE_NAME = "surajvish1/devsecop-cicd-pipeline"   // <-- replace with your real DockerHub username
        IMAGE_TAG  = "${env.BUILD_NUMBER}"
        EC2_HOST   = "ubuntu@35.175.93.218"
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Unit tests') {
            steps {
                sh 'npm test'
            }
        }

        stage('Secrets scan') {
            when { expression { return params.ENABLE_SECURITY_GATES } }
            steps {
                sh '''
                    docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest \
                      detect --source=/repo --no-git -v --exit-code 1 || \
                      (echo "Secrets detected — failing build" && exit 1)
                '''
            }
        }

        stage('Dependency scan') {
            when { expression { return params.ENABLE_SECURITY_GATES } }
            steps {
                sh '''
                    docker run --rm -v $(pwd):/app aquasec/trivy:latest fs \
                      --severity HIGH,CRITICAL --exit-code 1 /app
                '''
            }
        }

        stage('Build image') {
            steps {
                sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest ."
            }
        }

        stage('Container image scan — Trivy') {
            when { expression { return params.ENABLE_SECURITY_GATES } }
            steps {
                sh '''
                    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                      aquasec/trivy:latest image \
                      --severity HIGH,CRITICAL --exit-code 1 ${IMAGE_NAME}:${IMAGE_TAG}
                '''
            }
        }

        stage('Push image') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker push ${IMAGE_NAME}:${IMAGE_TAG}
                        docker push ${IMAGE_NAME}:latest
                    '''
                }
            }
        }

        stage('Deploy to EC2') {
            steps {
                sshagent(credentials: ['ec2-ssh-key']) {
                    sh '''
                        scp -o StrictHostKeyChecking=no docker-compose.yml ${EC2_HOST}:/home/ubuntu/app/docker-compose.yml
                        ssh -o StrictHostKeyChecking=no ${EC2_HOST} "
                            cd /home/ubuntu/app &&
                            echo 'IMAGE_NAME=${IMAGE_NAME}' > .env &&
                            echo 'IMAGE_TAG=${IMAGE_TAG}' >> .env &&
                            docker compose pull &&
                            docker compose up -d --remove-orphans &&
                            docker image prune -f
                        "
                    '''
                }
            }
        }

        stage('Post-deploy smoke test') {
            steps {
                sh '''
                    for i in 1 2 3 4 5; do
                        curl -fsS http://35.175.93.218/health && exit 0
                        echo "Attempt $i failed, retrying..."
                        sleep 5
                    done
                    echo "Smoke test failed after 5 attempts" && exit 1
                '''
            }
        }
    }

    post {
        success {
            echo "Pipeline succeeded — build #${env.BUILD_NUMBER} deployed."
        }
        failure {
            echo "Pipeline failed — check stage logs above."
        }
        always {
            sh 'docker logout || true'
        }
    }
}
