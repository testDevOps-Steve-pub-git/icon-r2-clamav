Branch under development.
# CF-CLAMAV


## Package info:

This package is a Node.js HTTP wrapper around the clamav daemon and the freshclam (virus database update utility)

It uses a custom node.js Buildpack which handles the building(see detail below)

Custom Node.js buildpack:https://github.com/Shifeng-ON/nodejs-buildpack.git

------------------------------------------------------------------------------------------------------------------
## Availiable HTTP API:(detail can be chekced on the PDF file in docs directory)

HTTP server will accept a single file per 'POST' request at '/scan' endpoint, and return scan result in HTTP status code

200 => No virus found.

400 => No file is uplaoded, or file is too large > 23M.

406 => virus found, including a json message indicating the virus signature.

500 => Server error

503 => The underlaying clamav daemon is not alive, it can not scan file.


------------------------------------------------------------------------------------------------------------------
## Deploying to Bluemix:

### Preconfigure

refer to the buildpack repository for information [see here](https://github.com/Shifeng-ON/nodejs-buildpack.git)

### Deployment

Please use command '$ cf push'

Clamav directory contains a pre-built binary of clamav program, when pushing to Blumix, you have two ways to go:

1. push the clamav directory along with the source code, in that case, the pushed clamav program will be used(reducing build time of the deployemnt) .

2. push without the clamav directory, at this stage, the buildpack will attemp to build clamav.

Note* 

The build time of 'cf push' might take a long time due to CVD fetching from public mirror.
(If take more than 5 minutes , please consider 'cf delete clam_cf', and issue 'cf push' again)

Or to speed up the build time, you can have preconfigure freshclam to use a private mirror by having "freshclam.env".