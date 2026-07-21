pipeline {
    agent any
    parameters {
        booleanParam(name: 'ENABLE_SECURITY_GATES', defaultValue: true,
            description: 'Run Gitleaks secrets scan and Trivy dependency/image scans.')
    }
    environment {
        IMAGE_NAME     = "node-app-cicd"
        CONTAINER_NAME = "node-app-cicd-container"
        HOST_PORT      = "5000"   // port exposed on the EC2 host (8080=Jenkins, 3000=Grafana, 9090=Prometheus reserved for later)
        CONTAINER_PORT = "8080"  // port the app listens on inside the container (matches Dockerfile EXPOSE)
    }
    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Extract Jira Issue') {
            steps {
                script {
                    def commitMsg = sh(script: 'git log -1 --pretty=%B', returnStdout: true).trim()
                    def matcher = commitMsg =~ /([A-Z]+-\d+)/
                    env.JIRA_ISSUE = matcher ? matcher[0][0] : null
                    echo "Detected Jira issue: ${env.JIRA_ISSUE}"
                }
            }
        }

        stage('Secrets Scan - Gitleaks') {
            when { expression { return params.ENABLE_SECURITY_GATES } }
            steps {
                sh '''
                    docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest \
                      detect --source=/repo --no-git -v --exit-code 1 || \
                      (echo "Secrets detected — failing build" && exit 1)
                '''
            }
        }

        stage('Dependency Scan - Trivy') {
            when { expression { return params.ENABLE_SECURITY_GATES } }
            steps {
                sh '''
                    docker run --rm -v $(pwd):/app aquasec/trivy:latest fs \
                      --severity HIGH,CRITICAL --exit-code 0 /app
                '''
            }
        }

        stage('Build Docker Image') {
            steps {
                sh "docker build -t ${IMAGE_NAME}:${BUILD_NUMBER} -t ${IMAGE_NAME}:latest ."
            }
        }
        stage('Container Image Scan - Trivy') {
            when { expression { return params.ENABLE_SECURITY_GATES } }
            steps {
                sh '''
                    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                      aquasec/trivy:latest image \
                      --severity HIGH,CRITICAL --exit-code 0 ${IMAGE_NAME}:latest
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh """
                    docker stop ${CONTAINER_NAME} || true
                    docker rm ${CONTAINER_NAME} || true
                    docker run -d --name ${CONTAINER_NAME} -p ${HOST_PORT}:${CONTAINER_PORT} ${IMAGE_NAME}:latest
                """
            }
        }
        stage('Health Check') {
            steps {
                sh """
                    for i in 1 2 3 4 5; do
                        curl -fsS http://localhost:${HOST_PORT} && exit 0
                        echo "Attempt \$i failed, retrying..."
                        sleep 5
                    done
                    echo "Health check failed after 5 attempts"
                    exit 1
                """
            }
        }
    }
    post {
        success {
            echo "Pipeline succeeded — build #${env.BUILD_NUMBER} deployed on port ${HOST_PORT}."
            script {
                if (env.JIRA_ISSUE) {
                    jiraComment(
                        issueKey: env.JIRA_ISSUE,
                        body: "✅ Build #${env.BUILD_NUMBER} deployed successfully on port ${HOST_PORT}. ${env.BUILD_URL}"
                    )
                }
            }
        }
        failure {
            echo "Pipeline failed — check stage logs above."
            script {
                if (env.JIRA_ISSUE) {
                    jiraComment(
                        issueKey: env.JIRA_ISSUE,
                        body: "❌ Build #${env.BUILD_NUMBER} failed. Check logs: ${env.BUILD_URL}"
                    )
                }
            }
        }
    }
}
