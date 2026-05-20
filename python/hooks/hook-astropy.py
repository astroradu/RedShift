from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

# astropy.visualization.wcsaxes calls pytest.importorskip('matplotlib') at import
# time, crashing PyInstaller's isolated submodule scanner when matplotlib is not
# installed. We don't use astropy.visualization at all, so filter it out before
# the child process tries to import it.
hiddenimports = collect_submodules(
    'astropy',
    filter=lambda name: not name.startswith('astropy.visualization'),
)
datas = collect_data_files('astropy')
binaries = collect_dynamic_libs('astropy')
