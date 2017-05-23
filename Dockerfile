FROM debian:jessie
# DEPRECATED
# set ClamAV version to use
# ENV AV_VERSION 0.99

# Debian Base to use
ENV DEBIAN_VERSION jessie
ENV TZ=America/Toronto
ENV LANG=en_CA.utf8

# initial install of av daemon 
RUN echo "deb http://http.debian.net/debian/ $DEBIAN_VERSION main contrib non-free" > /etc/apt/sources.list && \
    echo "deb http://http.debian.net/debian/ $DEBIAN_VERSION-updates main contrib non-free" >> /etc/apt/sources.list && \
    echo "deb http://security.debian.org/ $DEBIAN_VERSION/updates main contrib non-free" >> /etc/apt/sources.list && \
    echo "deb http://archive.debian.org/debian squeeze main non-free" >> /etc/apt/sources.list && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y -qq \
        clamav-daemon \
        clamav-freshclam \
        libclamunrar6 \
        wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# # initial update of av databases
RUN wget -O /var/lib/clamav/main.cvd http://db.CA.clamav.net/main.cvd && \
      wget -O /var/lib/clamav/daily.cvd http://db.CA.clamav.net/daily.cvd && \
      wget -O /var/lib/clamav/bytecode.cvd http://db.CA.clamav.net/bytecode.cvd && \
      chown clamav:clamav /var/lib/clamav/*.cvd

# permission juggling
RUN mkdir /var/run/clamav && \
    chown clamav:clamav /var/run/clamav && \
    chmod 750 /var/run/clamav

# av configuration update

RUN sed -i 's/^DatabaseMirror db.local.clamav.net$/DatabaseMirror db.CA.clamav.net/g'  /etc/clamav/freshclam.conf && \  
    sed -i 's/^Foreground .*$/Foreground true/g' /etc/clamav/clamd.conf && \
    echo "TCPSocket 3310" >> /etc/clamav/clamd.conf && \
    sed -i 's/^Foreground .*$/Foreground true/g' /etc/clamav/freshclam.conf

# volume provision
VOLUME ["/var/lib/clamav"]

# Copy source code directiroy and install dependancies
COPY    . /etc/nodeclamav

WORKDIR /etc/nodeclamav
# Setting up node js and install module for http server
RUN     wget --no-check-certificate -O ./node_for_debian.sh https://deb.nodesource.com/setup_6.x &&\  
        chmod a+x ./node_for_debian.sh && \
        ./node_for_debian.sh && \
        apt-get install -y nodejs && \
        npm install

# change user
USER clamav

# port provision
EXPOSE 8080

# av server bootstrapping
CMD ["app.js"]
ENTRYPOINT ["node"]

