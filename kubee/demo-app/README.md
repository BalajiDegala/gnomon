# CI/CD Demo Application

This intentionally small application validates the complete lab delivery path:

1. GitLab stores this source and its `Jenkinsfile`.
2. Jenkins tests the source and builds an immutable container image.
3. Jenkins pushes the commit-SHA tag to Harbor.
4. Jenkins commits the matching Kubernetes manifests to `platform-gitops`.
5. Argo CD discovers the child Application and deploys it to `demo`.

The application is a static nginx page so pipeline failures indicate platform
integration problems rather than application dependency problems.
