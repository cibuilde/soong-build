import io
import mmap
import os
import re
import sys
import xml.etree.ElementTree as ET

def grep(pattern, file_path):
    pattern = pattern.encode("utf-8")
    with io.open(file_path, "r", encoding="utf-8") as f:
        file_size = os.path.getsize(file_path)
        mm = mmap.mmap(f.fileno(), file_size, access=mmap.ACCESS_READ)
        return re.search(pattern, mm)

def parse_manifest(filename):
    tree = ET.parse(filename)
    root = tree.getroot()
    project_list = root.findall("project")
    projects = [ p.get("name") for p in project_list ]
    paths = { p.get("name"): p.get("path") for p in project_list if p.get("path") is not None }
    return projects, paths

filename = sys.argv[-1]
projects, paths = parse_manifest(filename)
#print(paths)
for p in projects:
    if "/" not in paths[p]:
        print("Ignore %s %s" % (p, paths[p]))

file_path = "sync.sh"
with io.open(file_path, "r", encoding="utf-8") as f:
    file_size = os.path.getsize(file_path)
    mm_systemimg = mmap.mmap(f.fileno(), file_size, access=mmap.ACCESS_READ)

whitelist = ["art", "bionic", "dalvik", "libcore", "libnativehelper"]
with open("local_manifest.xml", "w") as output_file:
    output_file.write('<?xml version="1.0" encoding="UTF-8"?>\n<manifest>\n')
    for p in projects:
        format_str = '\t<remove-project path="%s" name="%s" />\n'
        if paths[p] in whitelist:
            format_str = '\t<!--<remove-project path="%s" name="%s" />-->\n'
        elif '/' not in paths[p]:
            output_file.write("\t<!-- Ignore %s %s -->\n" % (p, paths[p]))
        elif re.search(paths[p].encode("utf-8"), mm_systemimg):
            format_str = '\t<!--<remove-project path="%s" name="%s" />-->\n'
        output_file.write(format_str % (paths[p], p))
    output_file.write('</manifest>')
#ret = grep("build/make_test", "systemimage_aosp_x86_64.sh")
#if ret:
#    print(ret.group())
