#!/bin/bash

set -e

if [$# -ne 1];then	
	echo "Ussage: $0 <taskVersion>"
	exit 1
fi

task_config_path=./task/taskVersions/task.$1.json

touch "./task/task.json";
cat  "$task_config_path" > "./task/task.json";

