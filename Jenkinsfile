pipeline {
    agent any
 
    environment {
        IMAGE_NAME     = "node-app-cicd"
        CONTAINER_NAME = "node-app-cicd-container"
        APP_PORT       = "8080"
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
 
        stage('Build Docker Image') {
            steps {
                sh "docker build -t ${IMAGE_NAME}:${BUILD_NUMBER} -t ${IMAGE_NAME}:latest ."
            }
        }
 
        stage('Deploy') {
            steps {
                sh """
                    docker stop ${CONTAINER_NAME} || true
                    docker rm ${CONTAINER_NAME} || true
                    docker run -d --name ${CONTAINER_NAME} -p ${APP_PORT}:${APP_PORT} ${IMAGE_NAME}:latest
                """
            }
        }
 
        stage('Health Check') {
            steps {
                sh """
                    for i in 1 2 3 4 5; do
                        curl -fsS http://localhost:${APP_PORT} && exit 0
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
            echo "Pipeline succeeded — build #${env.BUILD_NUMBER} deployed on port ${APP_PORT}."
        }
        failure {
            echo "Pipeline failed — check stage logs above."
        }
    }
}
