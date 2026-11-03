package dev.codeforge.ide.provider

import android.content.res.AssetFileDescriptor
import android.database.Cursor
import android.database.MatrixCursor
import android.graphics.Point
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract.Document
import android.provider.DocumentsContract.Root
import android.provider.DocumentsProvider
import android.webkit.MimeTypeMap
import dev.codeforge.ide.R
import dev.codeforge.ide.core.Paths
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException

/**
 * Exposes the CodeForge workspace (~) to the system Files app and to any app's file picker
 * (same idea as Termux's documents provider). Document ids are absolute paths inside the workspace.
 */
class WorkspaceDocumentsProvider : DocumentsProvider() {
    private val rootProjection = arrayOf(
        Root.COLUMN_ROOT_ID, Root.COLUMN_MIME_TYPES, Root.COLUMN_FLAGS, Root.COLUMN_ICON, Root.COLUMN_TITLE,
        Root.COLUMN_SUMMARY, Root.COLUMN_DOCUMENT_ID, Root.COLUMN_AVAILABLE_BYTES
    )
    private val docProjection = arrayOf(
        Document.COLUMN_DOCUMENT_ID, Document.COLUMN_MIME_TYPE, Document.COLUMN_DISPLAY_NAME,
        Document.COLUMN_LAST_MODIFIED, Document.COLUMN_FLAGS, Document.COLUMN_SIZE
    )

    private val base: File get() = Paths.home

    override fun onCreate(): Boolean {
        Paths.init(context!!)
        return true
    }

    private fun fileFor(id: String): File {
        val f = File(id)
        val canon = f.canonicalFile
        val b = base.canonicalFile
        if (canon != b && !canon.path.startsWith(b.path + File.separator)) {
            throw FileNotFoundException("Outside workspace: $id")
        }
        if (!f.exists() && !isLinkOnly(f)) throw FileNotFoundException("Missing: $id")
        return f
    }

    private fun isLinkOnly(f: File) = try { java.nio.file.Files.isSymbolicLink(f.toPath()) } catch (_: Exception) { false }

    private fun mimeOf(f: File): String {
        if (f.isDirectory) return Document.MIME_TYPE_DIR
        val ext = f.name.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

    private fun addRow(c: MatrixCursor, f: File) {
        var flags = 0
        if (f.isDirectory) {
            if (f.canWrite()) flags = flags or Document.FLAG_DIR_SUPPORTS_CREATE
        } else if (f.canWrite()) flags = flags or Document.FLAG_SUPPORTS_WRITE
        if (f.canonicalFile != base.canonicalFile) flags = flags or Document.FLAG_SUPPORTS_DELETE or Document.FLAG_SUPPORTS_RENAME
        c.newRow()
            .add(Document.COLUMN_DOCUMENT_ID, f.path)
            .add(Document.COLUMN_DISPLAY_NAME, if (f.canonicalFile == base.canonicalFile) context!!.getString(R.string.root_title) else f.name)
            .add(Document.COLUMN_SIZE, f.length())
            .add(Document.COLUMN_MIME_TYPE, mimeOf(f))
            .add(Document.COLUMN_LAST_MODIFIED, f.lastModified())
            .add(Document.COLUMN_FLAGS, flags)
    }

    override fun queryRoots(projection: Array<out String>?): Cursor {
        val c = MatrixCursor(projection ?: rootProjection)
        c.newRow()
            .add(Root.COLUMN_ROOT_ID, "codeforge-workspace")
            .add(Root.COLUMN_DOCUMENT_ID, base.path)
            .add(Root.COLUMN_TITLE, context!!.getString(R.string.app_name))
            .add(Root.COLUMN_SUMMARY, "Workspace")
            .add(Root.COLUMN_FLAGS, Root.FLAG_SUPPORTS_CREATE or Root.FLAG_SUPPORTS_IS_CHILD)
            .add(Root.COLUMN_MIME_TYPES, "*/*")
            .add(Root.COLUMN_AVAILABLE_BYTES, base.freeSpace)
            .add(Root.COLUMN_ICON, R.mipmap.ic_launcher)
        return c
    }

    override fun queryDocument(documentId: String, projection: Array<out String>?): Cursor {
        val c = MatrixCursor(projection ?: docProjection)
        addRow(c, fileFor(documentId))
        return c
    }

    override fun queryChildDocuments(parentDocumentId: String, projection: Array<out String>?, sortOrder: String?): Cursor {
        val c = MatrixCursor(projection ?: docProjection)
        val parent = fileFor(parentDocumentId)
        parent.listFiles()?.forEach { addRow(c, it) }
        return c
    }

    override fun isChildDocument(parentDocumentId: String, documentId: String): Boolean = try {
        File(documentId).canonicalPath.startsWith(File(parentDocumentId).canonicalPath + File.separator) ||
            File(documentId).canonicalPath == File(parentDocumentId).canonicalPath
    } catch (_: IOException) { false }

    override fun getDocumentType(documentId: String): String = mimeOf(fileFor(documentId))

    override fun openDocument(documentId: String, mode: String, signal: CancellationSignal?): ParcelFileDescriptor =
        ParcelFileDescriptor.open(fileFor(documentId), ParcelFileDescriptor.parseMode(mode))

    override fun openDocumentThumbnail(documentId: String, sizeHint: Point?, signal: CancellationSignal?): AssetFileDescriptor {
        val f = fileFor(documentId)
        val pfd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)
        return AssetFileDescriptor(pfd, 0, f.length())
    }

    override fun createDocument(parentDocumentId: String, mimeType: String, displayName: String): String {
        val parent = fileFor(parentDocumentId)
        val clean = displayName.replace('/', '_')
        var f = File(parent, clean)
        var n = 2
        while (f.exists()) f = File(parent, "$clean ($n)".also { n++ })
        try {
            val ok = if (mimeType == Document.MIME_TYPE_DIR) f.mkdir() else f.createNewFile()
            if (!ok) throw FileNotFoundException("Failed to create ${f.path}")
        } catch (e: IOException) {
            throw FileNotFoundException("Failed to create ${f.path}")
        }
        return f.path
    }

    override fun deleteDocument(documentId: String) {
        val f = fileFor(documentId)
        if (f.canonicalFile == base.canonicalFile) throw FileNotFoundException("Cannot delete the workspace root")
        dev.codeforge.ide.core.LinuxEnv.deleteTree(f)
    }

    override fun renameDocument(documentId: String, displayName: String): String {
        val f = fileFor(documentId)
        val dst = File(f.parentFile, displayName.replace('/', '_'))
        if (dst.exists() || !f.renameTo(dst)) throw FileNotFoundException("Rename failed")
        return dst.path
    }
}
