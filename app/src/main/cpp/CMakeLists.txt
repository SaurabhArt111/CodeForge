cmake_minimum_required(VERSION 3.10)
project(cfpty C)
add_library(cfpty SHARED pty.c)
target_compile_options(cfpty PRIVATE -std=c11 -Wall -Os -fno-stack-protector -D_GNU_SOURCE)
# 16 KB page-size devices (Android 15+): LOAD segments aligned to 16384. Only max-page-size, as the Android docs say:
# adding common-page-size=16384 pads the RELRO segment so that 4 KB devices fail to load the library
# ("dlopen failed: can't enable GNU RELRO protection … Out of memory").
target_link_options(cfpty PRIVATE -Wl,--gc-sections -Wl,-z,max-page-size=16384)
