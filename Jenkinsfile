pipeline {
    agent any

    options {
        timeout(time: 20, unit: 'MINUTES') // Prevent infinite hangs
    }
    
    environment {
        // Use your DockerHub credentials ID
        DOCKER_CREDS = 'dockerhub-cred'
        DOCKER_IMAGE = 'lilstex/applitrack-api'
    }

    stages {
        stage('Source') {
            steps {
                git branch: 'main', credentialsId: 'github-cred', url: 'https://github.com/lilstex/applitrack.git'
            }
        }

        stage('Build Image') {
            steps {
                sh """
                docker build \
                  --memory=1g \
                  --memory-swap=2g \
                  -t ${DOCKER_IMAGE}:${BUILD_NUMBER} .
                """

                sh "docker tag ${DOCKER_IMAGE}:${BUILD_NUMBER} ${DOCKER_IMAGE}:latest"
            }
        }

        stage('Push to Registry') {
            steps {
                script {
                    docker.withRegistry('', DOCKER_CREDS) {
                        sh "docker push ${DOCKER_IMAGE}:${BUILD_NUMBER}"
                        sh "docker push ${DOCKER_IMAGE}:latest"
                    }
                }
            }
        }

        stage('Deploy') { 
            environment {
                DATABASE_URI = credentials('DATABASE_URI')
                JWT_SECRET = credentials('JWT_SECRET')
                TOKEN_VALIDATION_DURATION = credentials('TOKEN_VALIDATION_DURATION')
                OPENAI_API_KEY = credentials('OPENAI_API_KEY')
            }

            steps { 
                sh """ 
                export BUILD_NUMBER=${BUILD_NUMBER} 

                docker-compose pull 
                docker-compose up -d --remove-orphans 
                """ 
            } 
        }

        stage('Cleanup') {
            steps {
                sh """
                docker image prune -f
                docker container prune -f
                """
            }
        }
    }
}