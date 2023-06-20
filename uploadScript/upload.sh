#!/bin/bash

set -eou pipefail

app_dir="/etc/prbranch"
tarball_path="/etc/prbranch/app/app.tar.gz"
docker_file="Dockerfile"
docker_port="3000"
expose_port="3000"

lock_file="add.lock"

removeLock(){
	rm -f "$lock_file";
	rm -f "$tarball_path"
}

trap removeLock EXIT INT TERM

if [ -f "$lock_file" ]; then
		echo "Curretly running previous opretaions."
		for i in {1...240};do
		sleep 5
                        if [ ! -f "$lock_file" ]; then
                         break
                        fi
                echo "Waiting ...."
                done
fi

# setting new lock file
exec 100>$lock_file || exit 1
echo -n "Locking the file"
flock -n 100 || exit 1
echo "ok"

# sudo chown -R ec2-user.ec2-user "$(dirname $app_dir)"

# get arguments from the shell script
while getopts "a:g:t:d:f:p:e" opt; do
        case $opt in
                a)
                        app_dir=${OPTARG};;
                t)
                        tarball_path=${OPTARG};;
                d)
                        docker_file=${OPTARG};;
                p)
                        docker_port=${OPTARG};;
                e)
                        expose_port=${OPTARG};;
                g)
                        docker_tag=${OPTARG};;
esac
done

echo "app_dir: $app_dir";
echo "tarball_path: $tarball_path";
echo "docker_file: $docker_file";
echo "docker_port: $docker_port";
echo "expose_port: $expose_port";

# is first run
if [ -f "$app_dir" ]; then
 IS_FIRST_RUN=false
else
 IS_FIRST_RUN=true
fi

# extract file
# remove tarball
tar -xvf "$tarball_path"
rm "$tarball_path"

# build docker images
# run docker image
# remove lock file
if docker build -f "$docker_file" -t "$docker_tag" .; then
        docker run -d -p "$expose_port":"$docker_port" "$docker_tag" 
else
        echo "failed to build docker image"
fi