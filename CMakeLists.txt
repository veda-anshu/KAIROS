cmake_minimum_required(VERSION 3.16)
project(kairos LANGUAGES CXX)

# ── C++17 required for std::thread, std::execution, structured bindings ──
set(CMAKE_CXX_STANDARD          17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS        OFF)

# ── Release build with full optimisation ──
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# ── Compiler flags ──
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(
        -O3
        -Wall
        -Wextra
        -Wpedantic
        -march=native          # Vectorise for the host CPU
    )
endif()

# ── Main executable ──
add_executable(kairos-engine
    engine/src/main.cpp
    engine/src/lsmc.cpp
    engine/src/shapley.cpp
)

target_include_directories(kairos-engine PRIVATE engine/include)

# ── pthreads (required for std::thread on Linux/WSL) ──
find_package(Threads REQUIRED)
target_link_libraries(kairos-engine Threads::Threads)

# ── Print build location after compilation ──
add_custom_command(TARGET kairos-engine POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E echo
        "✓ Built: $<TARGET_FILE:kairos-engine>"
)
