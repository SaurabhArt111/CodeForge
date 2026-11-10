cmake_minimum_required(VERSION 3.10)
project(cfpty C)
add_library(cfpty SHARED pty.c)
target_compile_options(cfpty PRIVATE -std=c11 -Wall -Os -fno-stack-protector -D_GNU_SOURCE)
# 16 KB page-size devices (Android 15+): LOAD segments must be aligned to 16384
target_link_options(cfpty PRIVATE -Wl,--gc-sections -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384)
