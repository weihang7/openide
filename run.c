#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <sys/wait.h>
#include <sys/time.h>
#include <sys/resource.h>

int main(int argc, char** argv) {
  struct rlimit limit;
  limit.rlim_cur = 1;
  limit.rlim_max = 1;
  setrlimit(RLIMIT_CPU, &limit);
  limit.rlim_cur = 64 * 1024 * 1024;
  limit.rlim_max = 64 * 1024 * 1024;
  setrlimit(RLIMIT_AS, &limit);
  limit.rlim_cur = 0;
  limit.rlim_max = 0;
  setrlimit(RLIMIT_NOFILE, &limit);
  pid_t process;
  process = fork();

  if (process < 0) {
    perror("fork");
    exit(EXIT_FAILURE);
  }
  if (process == 0) {
    return execl(argv[1], argv[1], (char*)NULL);
  } else {
    int status;
    wait(&status);
    if (WIFSIGNALED(status)) {
      int sig = WTERMSIG(status);
      switch(sig) {
        case SIGABRT:
          printf("Error %d: Program aborted.\n", SIGABRT);
          break;
        case SIGFPE:
          printf("Error %d: Floating point exception.\n", SIGFPE);
          break;
        case SIGILL:
          printf("Error %d: Illegal Instruction.\n", SIGILL);
          break;
        case SIGINT:
          printf("Error %d: Interrupt.\n", SIGINT);
          break;
        case SIGSEGV:
          printf("Error %d: Segmentation fault/memory limit exceeded.\n", SIGSEGV);
          break;
        case SIGTERM:
          printf("Error %d: Termination request sent to program.\n", SIGTERM);
          break;
        case 9:
          puts("Error 9: Time limit exceeded.");
          break;
        default:
          printf("Error %d: Unknown runtime error.\n", sig);
      }
    }
    struct rusage u;
    getrusage(RUSAGE_CHILDREN, &u);
    double t = 0.0;
    t += 1.0 * u.ru_utime.tv_sec + u.ru_utime.tv_usec / 1000000.0;
    t += 1.0 * u.ru_stime.tv_sec + u.ru_stime.tv_usec / 1000000.0;
    printf("\ntime used: %fs\n", t);
    printf("memory used: %ldKB", u.ru_maxrss);
  }
  return 0;
}
